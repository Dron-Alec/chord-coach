import { Metronome } from "../audio/clock";
import { chromaFromSamples, onsetTime } from "../audio/chroma";
import { closeMic, openMic, type Mic } from "../audio/mic";
import { encodeWav } from "../audio/wav";
import { parseChart, type Chart } from "../music/chart";
import { candidateChords, scoreBeat, type References, type Verdict } from "../music/scoring";
import { loadGuitar, playChord } from "../audio/guitar";
import { chordReferences } from "./references";
import { createStore } from "./store";
import { detectors, type DetectorName } from "./detectors";
import { beatWindow, overlapsClick } from "./window";

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
  beat: number | null; // chart beat currently heard (negative during the count-in), null when stopped
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
  beat: null,
  results: [],
  stats: { hit: 0, miss: 0, uncertain: 0 },
  liveChroma: new Array(12).fill(0),
  recording: false,
  calibration: null,
});

type Chunk = { frame: number; samples: Float32Array };

/** What the tab lane needs each animation frame; read directly, not through React. */
export type Lane = {
  chart: Chart;
  now: number; // AudioContext time currently being heard
  chartStart: number; // when chart beat 0 is heard
  spb: number;
  history: Map<number, BeatResult>; // absolute chart beat -> result
  idle?: boolean;
};

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
  private startTime = 0; // scheduled time of the first click (count-in) of the latest run
  private countIn = 0;
  private history = new Map<number, BeatResult>();
  private refs: References = {};
  private clicks: number[] = []; // scheduled click times, recent

  /** What each chart chord should sound like to the current detector (rendered from real guitar samples). */
  private async loadRefs() {
    const s = store.get();
    const chart = parseChart(s.chartText, s.beatsPerBar);
    store.set({ calibration: "Loading reference sounds…" });
    this.refs = await chordReferences(s.detector, candidateChords(chart.beats));
    store.set({ calibration: null });
  }

  /** Play a chord's reference strum so the player knows the target. */
  async preview(name: string) {
    try {
      this.ctx ??= new AudioContext({ latencyHint: "interactive" });
      await this.ctx.resume();
      await loadGuitar(this.ctx);
      playChord(this.ctx, name);
    } catch (e) {
      store.set({ error: `Can't play ${name}: ${(e as Error).message}` });
    }
  }

  /** Lane timing; null when stopped. */
  lane(): Lane | null {
    const s = store.get();
    if (!this.ctx || !this.metro || !s.chart || s.mode !== "play") return null;
    const spb = this.metro.secondsPerBeat;
    return {
      chart: s.chart,
      // The click scheduled at t is heard at t + outputLatency.
      now: this.ctx.currentTime - (this.ctx.outputLatency || 0),
      chartStart: this.startTime + this.countIn * spb,
      spb,
      history: this.history,
    };
  }

  update(patch: Partial<Settings>) {
    // Old verdicts don't line up with an edited chart.
    store.set("chartText" in patch || "beatsPerBar" in patch ? { ...patch, results: [] } : patch);
    const { chartText, bpm, beatsPerBar, offsetMs, threshold, detector, clickVolume } = store.get();
    try {
      localStorage.setItem("chord-coach", JSON.stringify({ chartText, bpm, beatsPerBar, offsetMs, threshold, detector, clickVolume }));
    } catch {
      /* private mode */
    }
    if (this.metro) this.metro.volume = clickVolume; // bpm etc. are locked while running
    // Basic Pitch's first call loads the model and compiles shaders (~10 s); do it before playing.
    if (patch.detector === "basicPitch") void detectors.basicPitch(new Float32Array(2048), 22050);
    if (patch.detector && store.get().mode === "play") void this.loadRefs();
  }

  toggle() {
    if (store.get().running) this.stop();
    else void this.start("play");
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
    if (mode === "play") {
      try {
        await this.loadRefs();
      } catch (e) {
        return store.set({ error: `Couldn't load reference sounds: ${(e as Error).message}`, calibration: null });
      }
    }

    this.stop();
    const metro = (this.metro = new Metronome(this.ctx, s.bpm, s.beatsPerBar, s.clickVolume));
    this.pending = [];
    this.calOffsets = [];
    this.history = new Map();
    this.countIn = mode === "play" ? s.beatsPerBar : 0;
    this.clicks = [];
    metro.onBeat = (beat, time) => {
      this.pending.push({ beat, time });
      this.clicks.push(time);
      if (this.clicks.length > 32) this.clicks.shift();
    };
    metro.start();
    this.startTime = metro.startTime;
    store.set({
      running: true, mode, error: null, chart, beat: -this.countIn,
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
    store.set({ running: false, mode: "idle", beat: null });
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
        const [winStart, winEnd] = beatWindow(real, spb, s.clickVolume > 0);
        if (winEnd > this.latestTime()) break;
        this.pending.shift();
        const chart = s.chart!;
        const chartBeat = beat - this.countIn;
        if (chartBeat < 0) continue; // count-in
        const i = chartBeat % chart.beats.length;
        const chord = chart.beats[i];
        const audio = this.extract(winStart, winEnd);
        const chroma = await detectors[s.detector](audio, this.ctx!.sampleRate);
        // Nothing played (or only the click, which is skipped): no verdict, no dot, not counted.
        if (!chroma.some((v) => v > 0)) continue;
        const { verdict, ratio } = scoreBeat(chroma, chord, this.refs, { threshold: s.threshold });
        const cur = store.get();
        if (!cur.running) break;
        const results = cur.results.slice();
        results[i] = { verdict, ratio, chord };
        this.history.set(chartBeat, results[i]!);
        if (this.history.size > 256) this.history.delete(this.history.keys().next().value!);
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
    const beat = Math.floor((heard - this.metro.startTime) / this.metro.secondsPerBeat) - this.countIn;
    const end = this.latestTime();
    const s = store.get();
    // Hold the last reading while the click is passing the mic, so the bars never show the metronome.
    const arrivals = s.clickVolume > 0 ? this.clicks.map((t) => t + s.offsetMs / 1000) : [];
    if (overlapsClick(end - 0.17, end, arrivals)) return store.set({ beat });
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
        const c = b - this.countIn;
        if (t >= 0 && c >= 0) beats.push({ index: c, time: +t.toFixed(4), chord: s.chart.beats[c % s.chart.beats.length] });
      }
    }
    const label = { sampleRate: sr, bpm: s.bpm, beatsPerBar: s.beatsPerBar, chart: s.chartText, offsetSec: s.offsetMs / 1000, clickAudible: s.clickVolume > 0, beats };
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

// Vite hot reload swaps this module; without this the old metronome keeps clicking with no UI attached.
import.meta.hot?.dispose(() => void session.shutdown());
