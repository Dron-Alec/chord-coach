/** Lookahead metronome: schedules clicks ~100 ms ahead on the AudioContext clock. */
export class Metronome {
  private nextTime = 0;
  private beat = 0;
  private timer: number | null = null;
  startTime = 0;
  /** Fires at schedule time, up to LOOKAHEAD before the click is heard. */
  onBeat?: (beat: number, time: number) => void;

  private ctx: AudioContext;
  bpm: number;
  beatsPerBar: number;
  volume: number;

  constructor(ctx: AudioContext, bpm = 100, beatsPerBar = 4, volume = 0.3) {
    this.ctx = ctx;
    this.bpm = bpm;
    this.beatsPerBar = beatsPerBar;
    this.volume = volume;
  }

  get secondsPerBeat() {
    return 60 / this.bpm;
  }

  start() {
    this.startTime = this.nextTime = this.ctx.currentTime + 0.1;
    this.beat = 0;
    this.timer = window.setInterval(() => this.tick(), 25);
  }

  stop() {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  /** Public so the mic stream can also drive it: background tabs throttle setInterval to 1 Hz. */
  tick() {
    if (this.timer === null) return;
    while (this.nextTime < this.ctx.currentTime + 0.1) {
      this.click(this.nextTime, this.beat % this.beatsPerBar === 0);
      this.onBeat?.(this.beat, this.nextTime);
      this.nextTime += this.secondsPerBeat;
      this.beat++;
    }
  }

  private noise: AudioBuffer | null = null;

  /** Unpitched noise tick: no note for the chord detectors to mistake for part of a chord. */
  private click(time: number, accent: boolean) {
    if (!this.volume) return;
    if (!this.noise) {
      this.noise = this.ctx.createBuffer(1, Math.round(this.ctx.sampleRate * 0.03), this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = accent ? 3000 : 5000;
    filter.Q.value = 1;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(this.volume * (accent ? 2.5 : 1.8), time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.03);
    src.connect(filter).connect(gain).connect(this.ctx.destination);
    src.start(time);
  }
}
