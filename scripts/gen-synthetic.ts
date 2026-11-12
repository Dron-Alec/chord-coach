// Generates the synthetic eval set in takes/synthetic/: Karplus-Strong guitar strums with real
// voicings, in the same WAV + JSON label format the app's "Record take" button writes.
// Deterministic (seeded), so re-running reproduces the committed files: npm run gen-synthetic
import { mkdirSync, writeFileSync } from "node:fs";
import { encodeWav } from "../src/audio/wav";
import { parseChart } from "../src/music/chart";

const SR = 24000;
const OPEN = [40, 45, 50, 55, 59, 64]; // E2 A2 D3 G3 B3 E4
// Frets, low E to high e; x = not played.
const VOICING: Record<string, string> = {
  C: "x32010", A: "x02220", G: "320003", E: "022100", D: "xx0232", F: "133211",
  Am: "x02210", Em: "022000", Dm: "xx0231", Bm: "x24432", "F#m": "244222", Bb: "x13331",
  G7: "320001", C7: "x32310", D7: "xx0212", E7: "020100", A7: "x02020",
  Am7: "x02010", Dm7: "xx0211", Cmaj7: "x32000", Fmaj7: "xx3210",
  Dsus4: "xx0233", Dsus2: "xx0230", Asus4: "x02230", Asus2: "x02200",
};

type Take = {
  name: string;
  chart: string;
  played?: string; // what is actually played, when it differs from the chart
  bpm: number;
  level?: number; // peak amplitude, default 0.5
  strum?: "down" | "eighths" | "half"; // per beat / down-up eighths / beats 1 and 3 only
};

const TAKES: Take[] = [
  { name: "basic", chart: "Am | F | C | G", bpm: 100 },
  { name: "relatives", chart: "C | Am | G | Em", bpm: 112 },
  { name: "relatives-eighths", chart: "F | Dm | Em | G", bpm: 108, strum: "eighths" },
  { name: "sus", chart: "D Dsus4 | Dsus2 D | A Asus4 | Asus2 A", bpm: 108 },
  { name: "sevenths", chart: "G7 C7 | D7 E7 | Am7 Dm7 | Cmaj7 Fmaj7", bpm: 104 },
  { name: "barre-quiet", chart: "Bm | F#m | Bb | F", bpm: 116, level: 0.08 },
  { name: "fast-eighths", chart: "C G | Am F | Dm G | C E7", bpm: 132, strum: "eighths" },
  { name: "ringing", chart: "G | D | Em | C", bpm: 96, strum: "half" },
  { name: "wrong-relatives", chart: "Am | Dm | Em | C", played: "Am C | Dm F | Em G | C Am", bpm: 108 },
  { name: "wrong-neighbours", chart: "C | G | D | A", played: "C F | G C | D G | A E", bpm: 112 },
];

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One Karplus-Strong string: delay line + averaging low-pass + allpass for fractional tuning. */
function makeString() {
  const buf = new Float32Array(SR / 60);
  let len = 1, pos = 0, last = 0, apIn = 0, apOut = 0, apC = 0, loss = 0, damp = 1;
  return {
    pluck(hz: number, velocity: number, rand: () => number) {
      const period = SR / hz;
      len = Math.floor(period - 0.6);
      const frac = period - 0.5 - len; // 0.1..1.1 samples left for the allpass
      apC = (1 - frac) / (1 + frac);
      loss = Math.exp(-6.9 / (hz * 3.5)); // fundamental T60 about 3.5 s
      const pick = Math.max(1, Math.round(len * (0.12 + 0.1 * rand()))); // pick position comb
      let lp = 0;
      for (let i = 0; i < len; i++) {
        lp += (0.35 + 0.4 * velocity) * (rand() * 2 - 1 - lp); // harder strum = brighter
        buf[i] = lp;
      }
      for (let i = len - 1; i >= pick; i--) buf[i] = (buf[i] - buf[i - pick]) * velocity;
      pos = 0; last = apIn = apOut = 0; damp = 1;
    },
    mute() {
      damp = 0.998;
    },
    next() {
      const out = buf[pos];
      const lp = loss * 0.5 * (out + last);
      last = out;
      apOut = apC * lp + apIn - apC * apOut;
      apIn = lp;
      buf[pos] = apOut * damp;
      pos = (pos + 1) % len;
      return out;
    },
  };
}

function render(take: Take, seed: number) {
  const rand = mulberry32(seed);
  const chart = parseChart(take.chart), played = parseChart(take.played ?? take.chart);
  const spb = 60 / take.bpm, lead = 0.4;
  const offsetSec = 0.03 + 0.09 * rand(); // pretend output+input latency
  const tuning = 2 ** ((rand() * 30 - 15) / 1200); // whole guitar up to 15 cents off
  const detune = OPEN.map(() => 2 ** ((rand() * 10 - 5) / 1200)); // each string up to 5 cents more
  const n = Math.round((lead + chart.beats.length * spb + 0.3) * SR);

  // Strum events: [sample, string, hz | 0 for mute, velocity]
  const events: [number, number, number, number][] = [];
  const strum = (t: number, chord: string, up: boolean, strength: number) => {
    const frets = VOICING[chord];
    if (!frets) throw new Error(`No voicing for ${chord}`);
    const spread = 0.01 + 0.02 * rand();
    const strings = up ? [5, 4, 3, 2] : [0, 1, 2, 3, 4, 5]; // up-strums catch the top strings
    strings.forEach((s, i) => {
      const at = Math.round((t + (spread * i) / 5 + 0.002 * rand()) * SR);
      if (frets[s] === "x") events.push([at, s, 0, 0]);
      else events.push([at, s, 440 * 2 ** ((OPEN[s] + Number(frets[s]) - 69) / 12) * tuning * detune[s], strength * (0.6 + 0.4 * rand())]);
    });
  };
  const beats = chart.beats.map((chord, i) => {
    const time = lead + i * spb;
    const actual = played.beats[i];
    const real = time + offsetSec + (rand() * 0.03 - 0.015); // human timing jitter
    if (take.strum !== "half" || i % 2 === 0) strum(real, actual, false, 1);
    if (take.strum === "eighths") strum(real + spb / 2, actual, true, 0.6);
    return { index: i, time: +time.toFixed(4), chord, ...(actual !== chord && { played: actual }) };
  });
  events.sort((a, b) => a[0] - b[0]);

  const strings = OPEN.map(makeString);
  const out = new Float32Array(n);
  let e = 0, rumble = 0, peak = 0;
  for (let i = 0; i < n; i++) {
    for (; e < events.length && events[e][0] <= i; e++) {
      const [, s, hz, vel] = events[e];
      if (hz) strings[s].pluck(hz, vel, rand);
      else strings[s].mute();
    }
    for (const s of strings) out[i] += s.next();
    peak = Math.max(peak, Math.abs(out[i]));
  }
  const level = take.level ?? 0.5;
  for (let i = 0; i < n; i++) {
    // Room noise at a fixed absolute level: white hiss plus low-frequency rumble.
    rumble += 0.02 * (rand() * 2 - 1 - rumble);
    out[i] = (out[i] / peak) * level + 0.002 * (rand() * 2 - 1) + 0.02 * rumble;
  }
  const label = { sampleRate: SR, bpm: take.bpm, beatsPerBar: 4, chart: take.chart, offsetSec: +offsetSec.toFixed(4), beats };
  return { wav: encodeWav(out, SR), label };
}

const dir = new URL("../takes/synthetic/", import.meta.url);
mkdirSync(dir, { recursive: true });
TAKES.forEach((take, i) => {
  const { wav, label } = render(take, i + 1);
  writeFileSync(new URL(`${take.name}.wav`, dir), new Uint8Array(wav));
  writeFileSync(new URL(`${take.name}.json`, dir), JSON.stringify(label, null, 2) + "\n");
});
console.log(`Wrote ${TAKES.length} takes to takes/synthetic/`);
