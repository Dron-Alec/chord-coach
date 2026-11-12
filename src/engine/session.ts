import { Metronome } from "../audio/clock";
import { chromaFromSamples, onsetTime } from "../audio/chroma";
import { closeMic, openMic, type Mic } from "../audio/mic";
import { encodeWav } from "../audio/wav";
import { parseChart, type Chart } from "../music/chart";
import { chordPitchClasses } from "../music/chords";
import { scoreBeat, type Verdict } from "../music/scoring";
import { createStore } from "./store";
import { detectors, type DetectorName } from "./detectors";

// Audio scored for a beat, in beats relative to the beat's real time.
// ponytail: fixed window, tune via eval (npm run eval) if strums get clipped.
export const WINDOW = { before: 1 / 8, after: 1 / 2 };
const KEEP_SECONDS = 6;

export type BeatResult = { verdict: Verdict; ratio: number; chord: string };

export type Settings = {
  chartText: string;
  bpm: number;
  beatsPerBar: number;
  offsetMs: number;
  threshold: number;
  detector: DetectorName;
  clickVolume: number;
};

export type Snapshot = Settings & {
  running: boolean;
  mode: "idle" | "play" | "calibrate";
  error: string | null;
  chart: Chart | null;
  beat: number; // beat currently heard, -1 before the first
  results: (BeatResult | null)[]; // latest result per chart beat
  stats: Record<Verdict, number>;
  liveChroma: number[];
  recording: boolean;
  calibration: string | null;
};

const saved = (() => {
  try {
    return JSON.parse(localStorage.getItem("chord-coach") ?? "{}") as Partial<Settings>;
  } catch {
    return {};
  }
})();

export const store = createStore<Snapshot>({
  chartText: "Am | F | C | G",
  bpm: 80,
  beatsPerBar: 4,
  offsetMs: 0,
  threshold: 0.6,
  detector: "chroma",
  clickVolume: 0.3,
  ...saved,
  running: false,
  mode: "idle",
  error: null,
  chart: null,
  beat: -1,
  results: [],
  stats: { hit: 0, miss: 0, uncertain: 0 },
  liveChroma: new Array(12).fill(0),
  recording: false,
  calibration: null,
});

type Chunk = { frame: number; samples: Float32Array };

class Session {
  private ctx: AudioContext | null = null;
  private mic: Mic | null = null;
  private metro: Metronome | null = null;
  private chunks: Chunk[] = [];
  private take: Chunk[] | null = null;
  private pending: { beat: number; time: number }[] = [];
  private scoring = false;
  private calOffsets: number[] = [];
  private raf = 0;
  private lastPaint = 0;
  private defaultOffsetSet = false;
  private startTime = 0; // scheduled time of beat 0 of the latest run

  update(patch: Partial<Settings>) {
    store.set(patch);
    const { chartText, bpm, beatsPerBar, offsetMs, threshold, detector, clickVolume } = store.get();
    try {
      localStorage.setItem("chord-coach", JSON.stringify({ chartText, bpm, beatsPerBar, offsetMs, threshold, detector, clickVolume }));
    } catch {
      /* private mode */
    }
    if (this.metro) this.metro.volume = clickVolume; // bpm etc. are locked while running
  }

  /** Must be called from a click handler: browsers block audio until a user gesture. */
  async start(mode: "play" | "calibrate") {
    const s = store.get();
    let chart: Chart | null = null;
    try {
      chart = parseChart(s.chartText, s.beatsPerBar);
    } catch (e) {
      if (mode === "play") return store.set({ error: (e as Error).message });
    }
    try {
      this.ctx ??= new AudioContext({ latencyHint: "interactive" });
      await this.ctx.resume();
      this.mic ??= await openMic(this.ctx, (f, x) => this.onBlock(f, x));
    } catch (e) {
      return store.set({ error: `Audio/mic unavailable: ${(e as Error).message}` });
    }
    if (!this.defaultOffsetSet && !saved.offsetMs) {
      // Best guess until calibrated: output + input latency.
      const ctx = this.ctx;
      this.update({ offsetMs: Math.round(((ctx.outputLatency || 0) + ctx.baseLatency + this.mic.inputLatency) * 1000) });
    }
    this.defaultOffsetSet = true;

    this.stop();
    const metro = (this.metro = new Metronome(this.ctx, s.bpm, s.beatsPerBar, s.clickVolume));
    this.pending = [];
    this.calOffsets = [];
    metro.onBeat = (beat, time) => this.pending.push({ beat, time });
    metro.start();
    this.startTime = metro.startTime;
    store.set({
      running: true, mode, error: null, chart, beat: -1,
      results: chart ? new Array(chart.beats.length).fill(null) : [],
      stats: { hit: 0, miss: 0, uncertain: 0 },
      calibration: mode === "calibrate" ? "Clap on each click…" : null,
    });
    this.raf = requestAnimationFrame(() => this.paint());
  }

  stop() {
    this.metro?.stop();
    this.metro = null;
    cancelAnimationFrame(this.raf);
    store.set({ running: false, mode: "idle", beat: -1 });
  }

  async shutdown() {
    this.stop();
    if (this.mic) closeMic(this.mic);
    this.mic = null;
    await this.ctx?.close();
    this.ctx = null;
  }

  toggleRecording() {
    if (this.take) {
      this.saveTake();
      this.take = null;
      store.set({ recording: false });
    } else {
      this.take = [];
      store.set({ recording: true });
    }
  }

  private onBlock(frame: number, samples: Float32Array) {
    const c = { frame, samples };
    this.chunks.push(c);
    this.take?.push(c);
    const sr = this.ctx!.sampleRate;
    while (this.chunks.length && (frame - this.chunks[0].frame) / sr > KEEP_SECONDS) this.chunks.shift();
    this.metro?.tick();
    void this.processPending();
  }

  private extract(startTime: number, endTime: number): Float32Array {
    const sr = this.ctx!.sampleRate;
    const start = Math.round(startTime * sr), end = Math.round(endTime * sr);
    const out = new Float32Array(Math.max(0, end - start));
    for (const { frame, samples } of this.chunks) {
      const from = Math.max(start, frame), to = Math.min(end, frame + samples.length);
      if (from < to) out.set(samples.subarray(from - frame, to - frame), from - start);
    }
    return out;
  }

  private latestTime() {
    const last = this.chunks[this.chunks.length - 1];
    return last ? (last.frame + last.samples.length) / this.ctx!.sampleRate : 0;
  }

  private async processPending() {
    if (this.scoring || !this.metro) return;
    this.scoring = true;
    try {
      const s = store.get();
      const spb = 60 / s.bpm;
      const offset = s.offsetMs / 1000;
      while (this.pending.length) {
        const { beat, time } = this.pending[0];
        const real = time + offset;
        if (s.mode === "calibrate") {
          if (real + 0.5 > this.latestTime()) break;
          this.pending.shift();
          // Raw offset from scheduled click to clap; independent of current offsetMs.
          const t = onsetTime(this.extract(time - 0.05, time + 0.5), this.ctx!.sampleRate);
          if (beat >= 2 && t !== null) this.calOffsets.push(t - 0.05);
          this.reportCalibration();
          continue;
        }
        if (real + WINDOW.after * spb > this.latestTime()) break;
        this.pending.shift();
        const chart = s.chart!;
        const i = beat % chart.beats.length;
        const chord = chart.beats[i];
        const audio = this.extract(real - WINDOW.before * spb, real + WINDOW.after * spb);
        const chroma = await detectors[s.detector](audio, this.ctx!.sampleRate);
        const { verdict, ratio } = scoreBeat(chroma, chordPitchClasses(chord), s.threshold);
        const cur = store.get();
        if (!cur.running) break;
        const results = cur.results.slice();
        results[i] = { verdict, ratio, chord };
        store.set({ results, stats: { ...cur.stats, [verdict]: cur.stats[verdict] + 1 } });
      }
    } finally {
      this.scoring = false;
    }
  }

  private reportCalibration() {
    const n = this.calOffsets.length;
    if (n < 8) return store.set({ calibration: `Clap on each click… ${n}/8` });
    const sorted = [...this.calOffsets].sort((a, b) => a - b);
    const median = sorted[Math.floor(n / 2)];
    const spread = (sorted[n - 2] - sorted[1]) * 1000;
    this.stop();
    this.update({ offsetMs: Math.round(median * 1000) });
    store.set({
      calibration: `Offset ${Math.round(median * 1000)} ms (spread ±${Math.round(spread / 2)} ms${spread > 60 ? " — noisy, try again" : ""})`,
    });
  }

  private paint() {
    if (!this.ctx || !this.metro) return;
    this.raf = requestAnimationFrame(() => this.paint());
    const now = performance.now();
    if (now - this.lastPaint < 33) return; // ~30 fps
    this.lastPaint = now;
    // The click scheduled at t is heard at t + outputLatency.
    const heard = this.ctx.currentTime - (this.ctx.outputLatency || 0);
    const beat = Math.floor((heard - this.metro.startTime) / this.metro.secondsPerBeat);
    const end = this.latestTime();
    store.set({ beat, liveChroma: chromaFromSamples(this.extract(end - 0.17, end), this.ctx.sampleRate) });
  }

  private saveTake() {
    const take = this.take;
    if (!take?.length || !this.ctx) return;
    const sr = this.ctx.sampleRate;
    const first = take[0].frame;
    const last = take[take.length - 1];
    const samples = new Float32Array(last.frame + last.samples.length - first);
    for (const c of take) samples.set(c.samples, c.frame - first);
    const s = store.get();
    const startSec = first / sr;
    const spb = 60 / s.bpm;
    const beats: { index: number; time: number; chord: string }[] = [];
    if (s.chart) {
      // Reconstruct scheduled beat times that fall inside the take.
      for (let b = 0; ; b++) {
        const t = this.startTime + b * spb - startSec;
        if (t > samples.length / sr) break;
        if (t >= 0) beats.push({ index: b, time: +t.toFixed(4), chord: s.chart.beats[b % s.chart.beats.length] });
      }
    }
    const label = { sampleRate: sr, bpm: s.bpm, beatsPerBar: s.beatsPerBar, chart: s.chartText, offsetSec: s.offsetMs / 1000, beats };
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    download(new Blob([encodeWav(samples, sr)], { type: "audio/wav" }), `take-${stamp}.wav`);
    download(new Blob([JSON.stringify(label, null, 2)], { type: "application/json" }), `take-${stamp}.json`);
  }
}

function download(blob: Blob, name: string) {
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export const session = new Session();
