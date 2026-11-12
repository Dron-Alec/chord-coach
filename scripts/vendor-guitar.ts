// One-off: packs guitar note samples into public/guitar/notes.wav for src/audio/guitar.ts.
// Source: github.com/nbrosowsky/tonejs-instruments, samples/guitar-acoustic/*.wav (CC-BY 3.0).
// Usage: node scripts/run.mjs scripts/vendor-guitar.ts <dir with E2.wav G2.wav As2.wav ...>
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromaFromSamples } from "../src/audio/chroma";
import { FIRST_MIDI, MIDI_STEP, NOTES_RATE, SLOT_SEC } from "../src/audio/guitar";
import { resample } from "../src/audio/resample";
import { decodeWav, encodeWav } from "../src/audio/wav";

const FILES = ["E2", "G2", "As2", "Cs3", "E3", "G3", "As3", "Cs4", "E4", "G4", "As4", "Cs5"];
const slot = Math.round(SLOT_SEC * NOTES_RATE);
const out = new Float32Array(FILES.length * slot);
FILES.forEach((name, i) => {
  const wav = decodeWav(new Uint8Array(readFileSync(`${process.argv[3]}/${name}.wav`)).buffer);
  const x = resample(wav.samples, wav.sampleRate, NOTES_RATE);
  const peak = x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  const onset = Math.max(0, x.findIndex((v) => Math.abs(v) > 0.02 * peak) - Math.round(0.003 * NOTES_RATE));
  const fade = Math.round(0.05 * NOTES_RATE);
  for (let j = 0; j < slot && onset + j < x.length; j++) out[i * slot + j] = ((x[onset + j] / peak) * 0.9 * Math.min(1, (slot - j) / fade));
  const ch = chromaFromSamples(out.subarray(i * slot, i * slot + slot / 4), NOTES_RATE);
  const pc = ch.indexOf(Math.max(...ch)), want = (FIRST_MIDI + i * MIDI_STEP) % 12;
  if (pc !== want) throw new Error(`${name}: sounds like pitch class ${pc}, expected ${want}`);
});
mkdirSync("public/guitar", { recursive: true });
writeFileSync("public/guitar/notes.wav", new Uint8Array(encodeWav(out, NOTES_RATE)));
console.log(`Wrote public/guitar/notes.wav (${FILES.length} notes)`);
