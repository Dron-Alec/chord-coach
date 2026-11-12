import { QUALITY } from "./chords";

export type Verdict = "hit" | "miss" | "uncertain";

/** Tuned with `npm run eval`; the numbers are in the README. */
export const SCORING = {
  compress: 0.5, // chroma ** compress before matching, so the loudest strings don't drown the third
  overtone: 0.4, // templates expect this much of each chord tone a fifth up (3rd harmonic), and its square a major third up (5th)
  tie: 0.7, // confidence when the expected chord exactly ties the best other chord
  gain: 2.2, // confidence gained per unit of match margin over the best other chord
  minMatch: 0.6, // if no chord at all matches this well, it wasn't a chord: uncertain
};

/** Chords count as the same when one's notes are a subset of the other's (C vs Cadd9, C vs C/E). */
export function sameChord(a: Set<number>, b: Set<number>): boolean {
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  return [...small].every((pc) => big.has(pc));
}

const ALL_CHORDS = Object.values(QUALITY).flatMap((intervals) =>
  Array.from({ length: 12 }, (_, root) => new Set(intervals.map((i) => (root + i) % 12))),
);

/** Cosine similarity between the chroma and the chord's template. */
function match(chroma: number[], chord: Set<number>): number {
  const t = new Array(12).fill(0);
  for (const pc of chord) {
    t[pc] += 1;
    t[(pc + 7) % 12] += SCORING.overtone;
    t[(pc + 4) % 12] += SCORING.overtone ** 2;
  }
  let dot = 0, tt = 0, cc = 0;
  for (let i = 0; i < 12; i++) {
    dot += chroma[i] * t[i];
    tt += t[i] * t[i];
    cc += chroma[i] * chroma[i];
  }
  return dot / Math.sqrt(tt * cc);
}

/**
 * Is the expected chord the best explanation of the chroma, or close to it? Compares its template
 * match against every other chord in the vocabulary (all roots), ignoring chords that are the same
 * as the expected one by `sameChord`. `ratio` is a 0..1 confidence: `tie` when level with the best
 * other chord, higher when ahead. hit at >= threshold, miss below floor.
 */
export function scoreBeat(chroma: number[], expected: Set<number>, threshold = 0.6, floor = 0.4) {
  if (!chroma.some((v) => v > 0)) return { verdict: "uncertain" as Verdict, ratio: 0 };
  const c = chroma.map((v) => v ** SCORING.compress);
  const own = match(c, expected);
  let rival = 0;
  for (const other of ALL_CHORDS) if (!sameChord(other, expected)) rival = Math.max(rival, match(c, other));
  const ratio = Math.min(1, Math.max(0, SCORING.tie + SCORING.gain * (own - rival)));
  const verdict: Verdict =
    Math.max(own, rival) < SCORING.minMatch ? "uncertain" : ratio >= threshold ? "hit" : ratio < floor ? "miss" : "uncertain";
  return { verdict, ratio };
}
