import { chordPitchClasses, parseChordName } from "./chords";

export type Verdict = "hit" | "miss" | "uncertain";

/** Chord name -> what that chord sounds like to the detector in use (see engine/references.ts). */
export type References = Record<string, number[]>;

/** Tuned with `npm run eval`; the numbers are in the README. */
export const SCORING = {
  coverage: 0.25, // a chord tone counts as played at this share of the loudest pitch class
  compress: 0.5, // chroma ** compress before comparing, so the loudest strings don't drown the third
  tie: 0.7, // confidence when the expected chord exactly ties the best other chord
  gain: 1.4, // confidence gained per unit of similarity margin over the best other chord
  minMatch: 0.4, // if no candidate is this similar, what was played is not a chord we know: miss
};

/** Chords count as the same when one's notes are a subset of the other's (C vs Cadd9, C vs C/E). */
export function sameChord(a: Set<number>, b: Set<number>): boolean {
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  return [...small].every((pc) => big.has(pc));
}

const COMMON = ["", "m", "7", "m7", "maj7", "sus2", "sus4"];
const ROOTS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

/** The chords a beat is ranked against: the chart's own, every major and minor, and the common variations on the chart's roots. */
export function candidateChords(chartChords: string[]): string[] {
  const roots = new Set(chartChords.map((c) => parseChordName(c).root));
  return [...new Set([...chartChords, ...ROOTS.flatMap((r) => [r, `${r}m`]), ...[...roots].flatMap((r) => COMMON.map((q) => r + q))])];
}

/** Correlation of the two compressed chromas (cosine after removing each one's mean, which is what all chords share). */
function similarity(a: number[], b: number[]): number {
  const center = (v: number[]) => {
    const c = v.map((x) => x ** SCORING.compress), mean = c.reduce((s, x) => s + x, 0) / c.length;
    return c.map((x) => x - mean);
  };
  const x = center(a), y = center(b);
  let dot = 0, xx = 0, yy = 0;
  for (let i = 0; i < x.length; i++) {
    dot += x[i] * y[i];
    xx += x[i] * x[i];
    yy += y[i] * y[i];
  }
  return xx && yy ? dot / Math.sqrt(xx * yy) : 0;
}

/**
 * Does the beat sound like the expected chord's reference, more than like any other candidate's?
 * `refs` holds the reference for the expected chord and for every candidate to rank it against;
 * candidates that are the same chord by `sameChord` don't compete. `ratio` is a 0..1 confidence:
 * `tie` when level with the best other chord, higher when ahead. hit at >= threshold, miss below floor.
 */
export function scoreBeat(chroma: number[], expected: string, refs: References, { threshold = 0.6, floor = 0.4 } = {}) {
  if (!refs[expected] || !chroma.some((v) => v > 0)) return { verdict: "uncertain" as Verdict, ratio: 0 };
  const own = similarity(chroma, refs[expected]);
  const pcs = chordPitchClasses(expected);
  let rival = 0;
  for (const name in refs) if (!sameChord(chordPitchClasses(name), pcs)) rival = Math.max(rival, similarity(chroma, refs[name]));
  const ratio = Math.min(1, Math.max(0, SCORING.tie + SCORING.gain * (own - rival)));
  let verdict: Verdict = Math.max(own, rival) < SCORING.minMatch || ratio < floor ? "miss" : ratio >= threshold ? "hit" : "uncertain";
  // One string's overtones mimic a major chord (D rings A and F#), so a hit needs nearly every chord
  // tone clearly present: all but one for 4+ note chords.
  const max = Math.max(...chroma);
  const present = [...pcs].filter((pc) => chroma[pc] >= SCORING.coverage * max).length;
  if (verdict === "hit" && present < (pcs.size >= 4 ? pcs.size - 1 : pcs.size)) verdict = "miss";
  return { verdict, ratio };
}
