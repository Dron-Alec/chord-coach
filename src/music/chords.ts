const ROOT: Record<string, number> = {
  C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6,
  Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11,
};

export const QUALITY: Record<string, number[]> = {
  "": [0, 4, 7],
  m: [0, 3, 7],
  "7": [0, 4, 7, 10],
  m7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  dim: [0, 3, 6],
  dim7: [0, 3, 6, 9],
  aug: [0, 4, 8],
  "6": [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  add9: [0, 2, 4, 7],
  "5": [0, 7],
  m7b5: [0, 3, 6, 10],
};

const ALIAS: Record<string, string> = {
  min: "m", "-": "m", M7: "maj7", "Δ": "maj7", "°": "dim", sus: "sus4", "+": "aug",
};

/** "C/G" -> pitch classes of C plus the bass note G. */
export function chordPitchClasses(name: string): Set<number> {
  const [main, bass] = name.trim().split("/");
  const m = main.match(/^([A-G][#b]?)(.*)$/);
  const quality = m ? (ALIAS[m[2]] ?? m[2]) : "";
  if (!m || !(m[1] in ROOT) || !(quality in QUALITY) || (bass !== undefined && !(bass in ROOT))) {
    throw new Error(`Unsupported chord: ${name}`);
  }
  const root = ROOT[m[1]];
  const pcs = new Set(QUALITY[quality].map((i) => (root + i) % 12));
  if (bass !== undefined) pcs.add(ROOT[bass]);
  return pcs;
}

export const PC_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
