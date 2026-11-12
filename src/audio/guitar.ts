import { voicing } from "../music/voicings";
import { resample } from "./resample";
import { decodeWav } from "./wav";

// public/guitar/notes.wav: one acoustic guitar note every MIDI_STEP semitones from FIRST_MIDI (E2),
// each in its own SLOT_SEC slot. Other pitches are resampled from the nearest slot.
// Samples: tonejs-instruments guitar-acoustic (CC-BY 3.0); packed by scripts/vendor-guitar.ts.
export const FIRST_MIDI = 40, MIDI_STEP = 3, SLOT_SEC = 2, NOTES_RATE = 32000;
const STRUM_SEC = 0.015; // per string, low to high

let notes: Float32Array | undefined;
let buffer: AudioBuffer | undefined;

/** Fetch the samples (once). Pass the AudioContext if you are going to playChord. */
export async function loadGuitar(ctx?: BaseAudioContext): Promise<void> {
  notes ??= decodeWav(await (await fetch(`${import.meta.env.BASE_URL}guitar/notes.wav`)).arrayBuffer()).samples;
  if (ctx && buffer?.sampleRate !== ctx.sampleRate) {
    buffer = ctx.createBuffer(1, notes.length, NOTES_RATE);
    buffer.getChannelData(0).set(notes);
  }
}

/** Nearest sampled note: its slot index and how far (as a rate) it must be shifted to sound `midi`. */
function nearest(midi: number) {
  const slots = notes!.length / (SLOT_SEC * NOTES_RATE);
  const slot = Math.min(slots - 1, Math.max(0, Math.round((midi - FIRST_MIDI) / MIDI_STEP)));
  return { slot, rate: 2 ** ((midi - FIRST_MIDI - slot * MIDI_STEP) / 12) };
}

/** Strum the chord's usual voicing through `ctx.destination`. Needs `await loadGuitar(ctx)` first. */
export function playChord(ctx: BaseAudioContext, name: string, when = ctx.currentTime): void {
  if (!buffer) throw new Error("loadGuitar(ctx) first");
  voicing(name).midi.forEach((midi, i) => {
    const { slot, rate } = nearest(midi);
    const src = new AudioBufferSourceNode(ctx, { buffer, playbackRate: rate });
    const gain = new GainNode(ctx, { gain: 0.3 });
    src.connect(gain).connect(ctx.destination);
    src.start(when + i * STRUM_SEC, slot * SLOT_SEC, SLOT_SEC - 0.01);
  });
}

/** The same strum rendered offline (peak 0.5). Works in Node; needs `await loadGuitar()` first. */
export function renderChord(name: string, sampleRate: number, seconds = 1.5): Float32Array {
  return renderNotes(voicing(name).midi, sampleRate, seconds);
}

/** Notes (MIDI, fractions detune) strummed in order, mixed and normalized to peak 0.5. */
export function renderNotes(midi: number[], sampleRate: number, seconds: number): Float32Array {
  if (!notes) throw new Error("loadGuitar() first");
  const out = new Float32Array(Math.round(seconds * sampleRate));
  const slotLen = SLOT_SEC * NOTES_RATE;
  midi.forEach((m, i) => {
    const { slot, rate } = nearest(m);
    const start = Math.round(i * STRUM_SEC * sampleRate);
    const need = Math.min(slotLen, Math.ceil(((out.length - start) * NOTES_RATE * rate) / sampleRate) + 64);
    const note = resample(notes!.subarray(slot * slotLen, slot * slotLen + need), NOTES_RATE * rate, sampleRate);
    for (let j = 0; j < note.length && start + j < out.length; j++) out[start + j] += note[j];
  });
  const peak = out.reduce((p, v) => Math.max(p, Math.abs(v)), 0) || 1;
  return out.map((v) => (v / peak) * 0.5);
}
