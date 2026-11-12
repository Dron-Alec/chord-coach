import { chromaFromSamples } from "../audio/chroma";

/** Audio window around one beat -> 12 pitch-class energies (C=0). Same signature live and in the eval harness. */
export type Detector = (samples: Float32Array, sampleRate: number) => number[] | Promise<number[]>;

export const detectors = {
  chroma: (s, sr) => chromaFromSamples(s, sr),
  // Dynamic import: TF.js and the model are only fetched once this detector runs.
  basicPitch: async (s, sr) => (await import("../audio/basicPitch")).basicPitchChroma(s, sr),
} satisfies Record<string, Detector>;

export type DetectorName = keyof typeof detectors;
