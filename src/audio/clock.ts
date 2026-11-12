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

  private click(time: number, accent: boolean) {
    if (!this.volume) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.value = accent ? 1500 : 1000;
    gain.gain.setValueAtTime(this.volume, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(time);
    osc.stop(time + 0.05);
  }
}
