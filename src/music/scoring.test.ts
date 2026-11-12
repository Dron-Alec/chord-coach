import { expect, it } from "vitest";
import { basicPitchChroma, resample } from "../audio/basicPitch";
import { chromaFromSamples } from "../audio/chroma";
import { chordPitchClasses } from "./chords";
import { sameChord, scoreBeat } from "./scoring";

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
const tone = (midis: number[], sr = 48000, sec = 0.4) => {
  const out = new Float32Array(sr * sec);
  for (const m of midis)
    for (let h = 1; h <= 4; h++)
      for (let i = 0; i < out.length; i++) out[i] += (0.1 / h) * Math.sin((2 * Math.PI * hz(m) * h * i) / sr);
  return out;
};
const verdict = (midis: number[], chord: string) => scoreBeat(chromaFromSamples(tone(midis), 48000), chordPitchClasses(chord)).verdict;

it("sameChord: subsets are the same chord, relatives are not", () => {
  const same = (a: string, b: string) => sameChord(chordPitchClasses(a), chordPitchClasses(b));
  expect(same("C", "Cadd9")).toBe(true);
  expect(same("C/E", "C")).toBe(true);
  expect(same("C5", "Cm")).toBe(true);
  expect(same("C", "Am")).toBe(false);
  expect(same("C", "Cm")).toBe(false);
});

it("tells relative chords apart", () => {
  const am = [45, 52, 57, 60, 64], c = [48, 52, 55, 60, 64]; // open Am and C voicings
  expect(verdict(am, "Am")).toBe("hit");
  expect(verdict(am, "C")).not.toBe("hit");
  expect(verdict(c, "C")).toBe("hit");
  expect(verdict(c, "Am")).not.toBe("hit");
  expect(verdict(c, "Cadd9")).toBe("hit"); // played a subset of what was asked
});

it("a single note is not a chord", () => {
  expect(verdict([45], "Am")).toBe("uncertain");
});

it("resample keeps pitch and duration", () => {
  const out = resample(tone([69], 48000, 0.2), 48000, 22050);
  expect(out.length).toBe(Math.floor(0.2 * 22050));
  const ch = chromaFromSamples(out, 22050);
  expect(ch.indexOf(Math.max(...ch))).toBe(9);
});

it("basicPitch detector hears C major", async () => {
  // Node has no page to fetch the model relative to; read it from public/ instead.
  const { readFileSync } = await import("node:fs");
  const webFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) =>
    typeof url === "string" && !/^\w+:/.test(url) ? new Response(readFileSync(`public/${url}`)) : webFetch(url, init);
  try {
    const ch = await basicPitchChroma(tone([48, 52, 55, 60]), 48000);
    expect(scoreBeat(ch, chordPitchClasses("C")).verdict).toBe("hit");
    expect(scoreBeat(ch, chordPitchClasses("Am")).verdict).not.toBe("hit");
  } finally {
    globalThis.fetch = webFetch;
  }
}, 30000);
