export type Verdict = "hit" | "miss" | "uncertain";

/** Chords count as the same when one's notes are a subset of the other's (C vs Cadd9, C vs C/E). */
export function sameChord(a: Set<number>, b: Set<number>): boolean {
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  return [...small].every((pc) => big.has(pc));
}

// ponytail: thresholds are guesses until the eval set (npm run eval) says otherwise.
export function scoreBeat(chroma: number[], expected: Set<number>, threshold = 0.6, floor = 0.4) {
  const total = chroma.reduce((a, b) => a + b, 0);
  if (total === 0) return { verdict: "uncertain" as Verdict, ratio: 0 };
  const inChord = [...expected].reduce((s, pc) => s + chroma[pc], 0);
  const ratio = inChord / total;
  const verdict: Verdict = ratio >= threshold ? "hit" : ratio < floor ? "miss" : "uncertain";
  return { verdict, ratio };
}
