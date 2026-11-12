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
