import { fftMag } from "./chroma";

/**
 * When a strum starts (s from window start), or null if nothing new was struck.
 *
 * Spectral flux on a log spectrum: the sum of how much each frequency got louder since the last frame.
 * Overall loudness can't see a quiet upstrum over a ringing chord, but the pick attack puts energy
 * between the chord's notes, and the log scale makes a quiet strum count nearly as much as a loud one.
 * Only 60 Hz to 1.5 kHz is used: the metronome tick lives at 7-9 kHz, so it never counts as a strum.
 */
export function strumOnset(
  samples: Float32Array,
  sampleRate: number,
  { minHz = 60, maxHz = 1500, hopSec = 0.005, frameSec = 0.03, rollSec = 0.04, compress = 1000, gate = 0.002, minFlux = 0.12, overMedian = 1.5, trace }: { minHz?: number; maxHz?: number; hopSec?: number; frameSec?: number; rollSec?: number; compress?: number; gate?: number; minFlux?: number; overMedian?: number; trace?: number[] } = {},
): number | null {
  let n = 1;
  while (n < frameSec * sampleRate) n <<= 1;
  const hop = Math.max(1, Math.round(hopSec * sampleRate));
  const hann = Float64Array.from({ length: n }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
  const lo = Math.max(1, Math.floor((minHz * n) / sampleRate)), hi = Math.ceil((maxHz * n) / sampleRate);
  const norm = 4 / n; // Hann-windowed FFT magnitude -> sine amplitude

  const flux: number[] = [];
  const loud: boolean[] = [];
  let prev: Float64Array | null = null;
  for (let at = 0; at + n <= samples.length; at += hop) {
    const buf = new Float64Array(n);
    let sq = 0;
    for (let i = 0; i < n; i++) {
      buf[i] = samples[at + i] * hann[i];
      sq += samples[at + i] ** 2;
    }
    const mag = fftMag(buf);
    const cur = new Float64Array(hi - lo);
    for (let k = lo; k < hi; k++) cur[k - lo] = Math.log1p(compress * mag[k] * norm);
    let f = 0;
    if (prev) for (let k = 0; k < cur.length; k++) f += Math.max(0, cur[k] - prev[k]);
    flux.push(f / cur.length);
    loud.push(Math.sqrt(sq / n) >= gate);
    prev = cur;
  }
  if (flux.length < 3) return null;

  // A strum rolls across the strings, each adding its own small flux spike; summing the flux over
  // the next ~40 ms makes the whole roll one event, peaking where the roll starts.
  const roll = Math.max(1, Math.round(rollSec / hopSec));
  const rolled = flux.map((_, i) => flux.slice(i, i + roll).reduce((a, b) => a + b, 0));
  trace?.push(...rolled);
  const median = [...rolled].sort((a, b) => a - b)[Math.floor(rolled.length / 2)];
  let best = -1;
  for (let i = 1; i < rolled.length; i++) if (loud[i] && (best < 0 || rolled[i] > rolled[best])) best = i;
  if (best < 0 || rolled[best] < Math.max(minFlux, overMedian * median)) return null;
  // The rolled sum plateaus while the roll is inside its 40 ms; its start is where it first gets close to the peak.
  let start = best;
  while (start > 1 && rolled[start - 1] > 0.8 * rolled[best]) start--;
  // +13 ms: measured bias of this estimate on sampled-guitar strums (7 chords, loud and quiet, spread 6 ms).
  return (start * hop + n / 2) / sampleRate + 0.013;
}

export type Judgment = "perfect" | "early" | "late" | "not-quite" | "hold";

// ponytail: Guitar Hero-ish window; widen if real players find "Perfect" too strict.
export const TIMING = { perfect: 0.1 };

/** Every chord gets one. hold ("Good") = right chord, but its strum couldn't be timed. */
export function judge(verdict: "hit" | "miss" | "uncertain", timing: number | null): Judgment {
  if (verdict !== "hit") return "not-quite";
  if (timing === null) return "hold";
  if (Math.abs(timing) <= TIMING.perfect) return "perfect";
  return timing < 0 ? "early" : "late";
}

export const JUDGMENT_LABEL: Record<Judgment, string> = {
  perfect: "Perfect", early: "Early", late: "Late", "not-quite": "Not Quite", hold: "Good",
};
