// Audio scored for a beat, in beats relative to the beat's real time.
// ponytail: fixed window, tune via eval (npm run eval) if strums get clipped.
export const WINDOW = { before: 1 / 8, after: 1 / 2 };

/** Start/end (s) of the audio scored for a beat. real = scheduled time + latency offset; spb = seconds per beat. */
export function beatWindow(real: number, spb: number): [start: number, end: number] {
  return [real - WINDOW.before * spb, real + WINDOW.after * spb];
}
