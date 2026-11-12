/**
 * When a strum starts (s from window start), or null if nothing new was struck.
 * The signal is low-passed first: the metronome tick lives at 3-5 kHz, the guitar's body below ~1.2 kHz,
 * so the tick bleeding through speakers never registers as a strum.
 */
export function strumOnset(samples: Float32Array, sampleRate: number, { cutoff = 1200, hopSec = 0.005, minJump = 3, gate = 0.003 } = {}): number | null {
  // RBJ biquad low-pass, Q = 0.707.
  const w = (2 * Math.PI * cutoff) / sampleRate, alpha = Math.sin(w) / (2 * Math.SQRT1_2), cos = Math.cos(w);
  const a0 = 1 + alpha;
  const b0 = (1 - cos) / 2 / a0, b1 = (1 - cos) / a0, a1 = (-2 * cos) / a0, a2 = (1 - alpha) / a0;
  // Two cascaded stages (4th order) so even a loud tick is ~40 dB down.
  const st = [new Float64Array(4), new Float64Array(4)]; // x1 x2 y1 y2 per stage

  const hop = Math.max(1, Math.round(hopSec * sampleRate));
  const energy: number[] = [];
  let e = 0;
  for (let i = 0; i < samples.length; i++) {
    let y = samples[i];
    for (const z of st) {
      const out = b0 * y + b1 * z[0] + b0 * z[1] - a1 * z[2] - a2 * z[3];
      z[1] = z[0]; z[0] = y; z[3] = z[2]; z[2] = out;
      y = out;
    }
    e += y * y;
    if ((i + 1) % hop === 0) {
      energy.push(e / hop);
      e = 0;
    }
  }

  // A strum is a jump of at least minJump x over the loudest of the previous ~30 ms (not the average:
  // notes in a ringing chord beat against each other, and the dips would look like new strums).
  // Of those, take the biggest absolute rise: a strum is far louder than anything left of a tick.
  const floor = gate * gate;
  const look = Math.max(1, Math.round(0.03 / hopSec));
  let best = -1, bestRise = 0;
  for (let i = look; i < energy.length; i++) {
    if (energy[i] < floor) continue;
    const before = Math.max(...energy.slice(i - look, i));
    const rise = energy[i] - before;
    if (energy[i] >= minJump * (before + floor) && rise > bestRise) {
      bestRise = rise;
      best = i;
    }
  }
  if (best < 0) return null;
  // A strum rolls across the strings over ~10-80 ms and the biggest rise lands mid-roll; walk back to
  // where it started: the first hop clearly above the quiet level just before it.
  const from = Math.max(0, best - Math.round(0.1 / hopSec));
  const quiet = Math.min(...energy.slice(from, best + 1));
  let start = best;
  while (start > from && energy[start - 1] > minJump * (quiet + floor)) start--;
  return (start * hop) / sampleRate;
}

export type Judgment = "perfect" | "early" | "late" | "not-quite" | "hold";

// ponytail: Guitar Hero-ish window; widen if real players find "Perfect" too strict.
export const TIMING = { perfect: 0.05 };

/** null = nothing to judge. hold = right chord still ringing with no new strum near the beat (strumming once per bar is fine). */
export function judge(verdict: "hit" | "miss" | "uncertain", timing: number | null): Judgment | null {
  if (verdict === "uncertain" && timing === null) return null; // a chord fading out, not something played
  if (verdict !== "hit") return "not-quite";
  if (timing === null) return "hold";
  if (Math.abs(timing) <= TIMING.perfect) return "perfect";
  return timing < 0 ? "early" : "late";
}

export const JUDGMENT_LABEL: Record<Judgment, string> = {
  perfect: "Perfect", early: "Early", late: "Late", "not-quite": "Not Quite", hold: "",
};
