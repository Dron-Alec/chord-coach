import { BasicPitch } from "@spotify/basic-pitch";
import { engine } from "@tensorflow/tfjs";
import { resample } from "./resample";

const RATE = 22050; // the model's fixed input rate
const LOWEST_MIDI = 21; // model output bin 0 = A0, 88 bins

let model: BasicPitch | undefined;
let queue: Promise<unknown> = Promise.resolve();

/** Basic Pitch note activations, summed over the window and folded to 12 pitch classes (sum 1, or all zeros). */
export function basicPitchChroma(samples: Float32Array, sampleRate: number, minActivation = 0.3): Promise<number[]> {
  // One at a time: the tensor scope in run() must not interleave with another call's.
  const result = queue.then(() => run(samples, sampleRate, minActivation));
  queue = result.catch(() => {});
  return result;
}

async function run(samples: Float32Array, sampleRate: number, minActivation: number): Promise<number[]> {
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
