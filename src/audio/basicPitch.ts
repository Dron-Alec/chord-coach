import { BasicPitch } from "@spotify/basic-pitch";
import { engine } from "@tensorflow/tfjs";

const RATE = 22050; // the model's fixed input rate
const LOWEST_MIDI = 21; // model output bin 0 = A0, 88 bins

/** Windowed-sinc resampler (Hann, 16 zero crossings each side); low-passes when downsampling. */
export function resample(x: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return x;
  const step = from / to, cutoff = Math.min(1, to / from), half = 16 / cutoff;
  const out = new Float32Array(Math.floor(x.length / step));
  for (let i = 0; i < out.length; i++) {
    const t = i * step;
    let acc = 0;
    for (let j = Math.max(0, Math.ceil(t - half)); j <= Math.min(x.length - 1, Math.floor(t + half)); j++) {
      const d = (j - t) * cutoff;
      const sinc = d === 0 ? 1 : Math.sin(Math.PI * d) / (Math.PI * d);
      acc += x[j] * sinc * (0.5 + 0.5 * Math.cos((Math.PI * d) / 16));
    }
    out[i] = acc * cutoff;
  }
  return out;
}

let model: BasicPitch | undefined;

/** Basic Pitch note activations, summed over the window and folded to 12 pitch classes (sum 1, or all zeros). */
export async function basicPitchChroma(samples: Float32Array, sampleRate: number, minActivation = 0.3): Promise<number[]> {
  model ??= new BasicPitch(`${import.meta.env.BASE_URL}basic-pitch/model.json`);
  const chroma = new Array(12).fill(0);
  // The model pads short input to its 2 s frame itself and trims the output back to the input length.
  await model.model; // weights must be created outside the scope below, or it would dispose them
  engine().startScope(); // evaluateModel never disposes its tensors; without this every beat leaks GPU memory
  try {
    await model.evaluateModel(
      resample(samples, sampleRate, RATE),
      (frames) => {
        for (const frame of frames)
          frame.forEach((a, bin) => {
            if (a >= minActivation) chroma[(LOWEST_MIDI + bin) % 12] += a;
          });
      },
      () => {},
    );
  } finally {
    engine().endScope();
  }
  const total = chroma.reduce((a, b) => a + b, 0);
  return total ? chroma.map((v) => v / total) : chroma;
}
