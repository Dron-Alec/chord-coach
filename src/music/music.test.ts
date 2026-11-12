import { describe, expect, it } from "vitest";
import { chordPitchClasses, QUALITY } from "./chords";
import { parseChart } from "./chart";
import { scoreBeat } from "./scoring";
import { chromaFromSamples, onsetTime } from "../audio/chroma";

const pcs = (name: string) => [...chordPitchClasses(name)].sort((a, b) => a - b);

describe("chordPitchClasses", () => {
  it.each([
    ["C", [0, 4, 7]], ["Am", [0, 4, 9]], ["G7", [2, 5, 7, 11]], ["Em7", [2, 4, 7, 11]],
    ["Fmaj7", [0, 4, 5, 9]], ["Dsus2", [2, 4, 9]], ["Asus4", [2, 4, 9]], ["Bdim", [2, 5, 11]],
    ["Bdim7", [2, 5, 8, 11]], ["Caug", [0, 4, 8]], ["C6", [0, 4, 7, 9]], ["Am6", [0, 4, 6, 9]],
    ["Cadd9", [0, 2, 4, 7]], ["E5", [4, 11]], ["Bm7b5", [2, 5, 9, 11]],
    ["Bb", [2, 5, 10]], ["F#m", [1, 6, 9]], ["Ebmaj7", [2, 3, 7, 10]],
    ["Amin", [0, 4, 9]], ["CM7", [0, 4, 7, 11]], ["C/B", [0, 4, 7, 11]], ["D/F#", [2, 6, 9]],
  ])("%s", (name, expected) => expect(pcs(name)).toEqual(expected));

  it("covers every quality", () => {
    for (const q of Object.keys(QUALITY)) expect(chordPitchClasses(`C${q}`).has(0)).toBe(true);
  });

  it.each(["H", "Cxyz", "C/Q", ""])("rejects %s", (bad) => expect(() => chordPitchClasses(bad)).toThrow());
});

describe("parseChart", () => {
  it("one chord per bar", () => {
    const c = parseChart("Am | F | C | G");
    expect(c.beats).toHaveLength(16);
    expect(c.beats.slice(0, 5)).toEqual(["Am", "Am", "Am", "Am", "F"]);
  });
  it("splits bars and handles %, newlines, 3/4", () => {
    expect(parseChart("C G | %\nAm", 4).beats).toEqual(["C", "C", "G", "G", "C", "C", "G", "G", "Am", "Am", "Am", "Am"]);
    expect(parseChart("C F G", 4).beats).toEqual(["C", "C", "F", "G"]);
    expect(parseChart("D | A", 3).beats).toEqual(["D", "D", "D", "A", "A", "A"]);
  });
  it("rejects bad input", () => {
    expect(() => parseChart("")).toThrow();
    expect(() => parseChart("Q")).toThrow();
    expect(() => parseChart("C D E F G")).toThrow();
  });
});

const tone = (freqs: number[], sr = 48000, sec = 0.4) => {
  const out = new Float32Array(sr * sec);
  for (const f of freqs)
    for (let h = 1; h <= 4; h++) // guitar-ish harmonics, decaying
      for (let i = 0; i < out.length; i++) out[i] += (0.1 / h) * Math.sin((2 * Math.PI * f * h * i) / sr);
  return out;
};

describe("chroma + scoring", () => {
  const cMajor = tone([130.81, 164.81, 196.0, 261.63]); // C3 E3 G3 C4

  it("C major lands on C, E, G", () => {
    const ch = chromaFromSamples(cMajor, 48000);
    const top3 = ch.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).slice(0, 3).map((x) => x[1]).sort((a, b) => a - b);
    expect(top3).toEqual([0, 4, 7]);
  });

  it("scores hit for right chord, miss for wrong one", () => {
    const ch = chromaFromSamples(cMajor, 48000);
    expect(scoreBeat(ch, chordPitchClasses("C")).verdict).toBe("hit");
    expect(scoreBeat(ch, chordPitchClasses("F#")).verdict).toBe("miss");
  });

  it("silence is uncertain", () => {
    const ch = chromaFromSamples(new Float32Array(4800), 48000);
    expect(scoreBeat(ch, chordPitchClasses("C")).verdict).toBe("uncertain");
  });
});

describe("onsetTime", () => {
  it("finds a clap", () => {
    const s = new Float32Array(48000 * 0.5);
    for (let i = 9600; i < 10600; i++) s[i] = 0.5 * Math.sin(i);
    expect(onsetTime(s, 48000)).toBeCloseTo(0.2, 2);
    expect(onsetTime(new Float32Array(4800), 48000)).toBeNull();
  });
});
