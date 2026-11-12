import { loadGuitar, renderChord } from "../audio/guitar";
import type { References } from "../music/scoring";
import { detectors, type DetectorName } from "./detectors";

// The reference strum is framed like a live beat window: a short lead-in, then the chord ringing.
const RATE = 22050, LEAD_SEC = 0.05, RING_SEC = 0.4;
const cache = new Map<string, number[]>();

/**
 * What each chord sounds like to a detector: the detector's output for a strum of the chord's usual
 * voicing on the sampled guitar. Cached per detector and chord; chords with no voicing are left out.
 */
export async function chordReferences(detector: DetectorName, names: string[]): Promise<References> {
  await loadGuitar();
  const refs: References = {};
  for (const name of new Set(names)) {
    const key = `${detector}:${name}`;
    if (!cache.has(key)) {
      const audio = new Float32Array(Math.round((LEAD_SEC + RING_SEC) * RATE));
      try {
        audio.set(renderChord(name, RATE, RING_SEC), Math.round(LEAD_SEC * RATE));
      } catch {
        continue;
      }
      cache.set(key, await detectors[detector](audio, RATE));
    }
    refs[name] = cache.get(key)!;
  }
  return refs;
}
