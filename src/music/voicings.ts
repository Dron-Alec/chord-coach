// Guitar fingerings from chords-db (MIT, github.com/tombatossals/chords-db).
import db from "@tombatossals/chords-db/lib/guitar.json";
import { chordPitchClasses, parseChordName, pitchClass } from "./chords";

export type Voicing = {
  frets: number[]; // absolute frets, low E -> high e, -1 = muted
  midi: number[]; // sounding notes, low to high
};

type DbPosition = { frets: number[]; baseFret: number; midi: number[] };
const chords = (db as unknown as { chords: Record<string, { suffix: string; positions: DbPosition[] }[]> }).chords;

const DB_KEY = ["C", "Csharp", "D", "Eb", "E", "F", "Fsharp", "G", "Ab", "A", "Bb", "B"];
const DB_BASS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "Bb", "B"];
const DB_SUFFIX: Record<string, string> = { "": "major", m: "minor" };

/** First listed position whose notes all belong to the chord (the db has a few typos, e.g. C#aug). */
function lookup(key: string, suffix: string, pcs: Set<number>): Voicing | null {
  const p = chords[key]?.find((c) => c.suffix === suffix)?.positions.find((p) => p.midi.every((m) => pcs.has(m % 12)));
  if (!p) return null;
  return { frets: p.frets.map((f) => (f > 0 ? f + p.baseFret - 1 : f)), midi: p.midi };
}

/** The most common guitar voicing of a chord. */
export function voicing(name: string): Voicing {
  const { root, quality, bass } = parseChordName(name);
  const pc = pitchClass(root);
  if (quality === "5") {
    // Power chord: root on the low E string, or the A string if that's past fret 7.
    const e = (pc - 4 + 12) % 12, a = (pc - 9 + 12) % 12;
    return e <= 7
      ? { frets: [e, e + 2, e + 2, -1, -1, -1], midi: [40 + e, 47 + e, 52 + e] }
      : { frets: [-1, a, a + 2, a + 2, -1, -1], midi: [45 + a, 52 + a, 57 + a] };
  }
  const key = DB_KEY[pc];
  const suffix = DB_SUFFIX[quality] ?? quality;
  if (bass !== undefined) {
    const slash = `${quality === "m" ? "m" : ""}/${DB_BASS[pitchClass(bass)]}`;
    const v = (quality === "" || quality === "m") && lookup(key, slash, chordPitchClasses(name));
    if (v) return v;
  }
  const v = lookup(key, suffix, chordPitchClasses(name));
  if (!v) throw new Error(`No guitar voicing for ${name}`);
  return v;
}
