import "../../scripts/public-fetch";
import { beforeAll, expect, it } from "vitest";
import { chromaFromSamples } from "../audio/chroma";
import { loadGuitar, renderChord } from "../audio/guitar";
import { resample } from "../audio/resample";
import { detectors } from "../engine/detectors";
import { chordReferences } from "../engine/references";
import { chordPitchClasses } from "./chords";
import { candidateChords, sameChord, scoreBeat, type References } from "./scoring";

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
// Not the sampled guitar: plain decaying harmonics, so the references are tested on a foreign timbre.
const tone = (midis: number[], sr = 48000, sec = 0.4) => {
  const out = new Float32Array(sr * sec);
  for (const m of midis)
    for (let h = 1; h <= 4; h++)
      for (let i = 0; i < out.length; i++) out[i] += (0.1 / h) * Math.sin((2 * Math.PI * hz(m) * h * i) / sr);
  return out;
};
const AM = [45, 52, 57, 60, 64], C = [48, 52, 55, 60, 64]; // open Am and C voicings

let refs: References;
beforeAll(async () => {
  refs = await chordReferences("chroma", candidateChords(["Am", "C", "Cadd9"]));
});
const verdict = (midis: number[], chord: string) => scoreBeat(chromaFromSamples(tone(midis), 48000), chord, refs).verdict;

it("sameChord: subsets are the same chord, relatives are not", () => {
  const same = (a: string, b: string) => sameChord(chordPitchClasses(a), chordPitchClasses(b));
  expect(same("C", "Cadd9")).toBe(true);
  expect(same("C/E", "C")).toBe(true);
  expect(same("C5", "Cm")).toBe(true);
  expect(same("C", "Am")).toBe(false);
  expect(same("C", "Cm")).toBe(false);
});

it("candidateChords: the chart, all majors and minors, variations on the chart's roots", () => {
  const c = candidateChords(["Am", "D/F#"]);
  for (const name of ["Am", "D/F#", "C", "F#m", "A", "Asus2", "A7", "Dsus4", "Dmaj7"]) expect(c).toContain(name);
  expect(c).not.toContain("Csus4");
  expect(new Set(c).size).toBe(c.length);
});

it("the sampled guitar plays the chord's notes", async () => {
  await loadGuitar();
  const audio = renderChord("G", 22050, 0.5);
  expect(audio.length).toBe(11025);
  expect(Math.max(...audio.map(Math.abs))).toBeCloseTo(0.5);
  const ch = chromaFromSamples(audio, 22050);
  const top3 = ch.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).slice(0, 3).map((x) => x[1]).sort((a, b) => a - b);
  expect(top3).toEqual([2, 7, 11]);
});

it("tells relative chords apart", () => {
  expect(verdict(AM, "Am")).toBe("hit");
  expect(verdict(AM, "C")).toBe("miss");
  expect(verdict(C, "C")).toBe("hit");
  expect(verdict(C, "Am")).toBe("miss");
  expect(verdict(C, "Cadd9")).toBe("hit"); // played a subset of what was asked
  expect(verdict(C, "F#")).toBe("miss");
});

it("silence and chords without a reference are uncertain", () => {
  expect(scoreBeat(chromaFromSamples(new Float32Array(4800), 48000), "C", refs).verdict).toBe("uncertain");
  expect(scoreBeat(chromaFromSamples(tone(C), 48000), "C", {}).verdict).toBe("uncertain");
});

it("resample keeps pitch and duration", () => {
  const out = resample(tone([69], 48000, 0.2), 48000, 22050);
  expect(out.length).toBe(Math.floor(0.2 * 22050));
  const ch = chromaFromSamples(out, 22050);
  expect(ch.indexOf(Math.max(...ch))).toBe(9);
});

it("basicPitch detector tells C from Am", async () => {
  const bpRefs = await chordReferences("basicPitch", ["C", "Am", "F", "G"]);
  const ch = await detectors.basicPitch(tone(C), 48000);
  expect(scoreBeat(ch, "C", bpRefs).verdict).toBe("hit");
  expect(scoreBeat(ch, "Am", bpRefs).verdict).toBe("miss");
}, 60000);

it("a single low D string (with its overtones) is not a D chord", () => {
  const sr = 48000, out = new Float32Array(sr * 0.4);
  for (let h = 1; h <= 8; h++) for (let i = 0; i < out.length; i++) out[i] += (0.2 / h) * Math.sin((2 * Math.PI * 146.8 * h * i) / sr);
  const ch = chromaFromSamples(out, sr);
  const refs = { D: [0, 0, 1, 0, 0, 0, 0.8, 0, 0, 0.9, 0, 0], G: [0, 0, 0.8, 0, 0, 0, 0, 1, 0, 0, 0, 0.8] };
  expect(scoreBeat(ch, "D", refs).verdict).not.toBe("hit");
});
