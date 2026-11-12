// Audio scored for a beat, in beats relative to the beat's real time.
// ponytail: fixed window, tune via eval (npm run eval) if strums get clipped.
export const WINDOW = { before: 1 / 8, after: 1 / 2 };

// How long the metronome click (plus room echo) lasts at the mic, from its expected arrival.
// ponytail: fixed guess; widen if a loud room still leaks the tick into scoring.
export const CLICK_MASK = { before: 0.02, after: 0.1 };
const MIN_WINDOW_SEC = 0.25;

/**
 * Start/end (s) of the audio scored for a beat. real = scheduled time + latency offset; spb = seconds per beat.
 * With `clickAudible`, the click arrives at the mic at `real`, so scoring starts after it and the app never
 * scores its own metronome. The strum's attack is lost, but the ringing chord is what identifies it.
 */
export function beatWindow(real: number, spb: number, clickAudible = false): [start: number, end: number] {
  if (!clickAudible) return [real - WINDOW.before * spb, real + WINDOW.after * spb];
  const start = real + CLICK_MASK.after;
  return [start, Math.max(real + WINDOW.after * spb, start + MIN_WINDOW_SEC)];
}

/** True when [start, end] overlaps a click's arrival at the mic. */
export function overlapsClick(start: number, end: number, clickArrivals: number[]): boolean {
  return clickArrivals.some((t) => start < t + CLICK_MASK.after && end > t - CLICK_MASK.before);
}
