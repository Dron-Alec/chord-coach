/** In-place radix-2 FFT; returns magnitudes of the first n/2 bins. n must be a power of 2. */
function fftMag(re: Float64Array): Float64Array {
  const n = re.length;
  const im = new Float64Array(n);
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) [re[i], re[j]] = [re[j], re[i]];
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
  const mag = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) mag[i] = Math.hypot(re[i], im[i]);
  return mag;
}

export type ChromaOptions = { minHz?: number; maxHz?: number; gate?: number };

/**
 * Samples -> 12 pitch-class energies (C=0), normalized to sum 1.
 * All zeros when the signal is below the RMS gate (nothing played).
 */
export function chromaFromSamples(
  samples: Float32Array,
  sampleRate: number,
  { minHz = 80, maxHz = 1000, gate = 0.003 }: ChromaOptions = {},
): number[] {
  const chroma = new Array(12).fill(0);
  let sq = 0;
  for (const s of samples) sq += s * s;
  if (!samples.length || Math.sqrt(sq / samples.length) < gate) return chroma;

  let n = 1;
  while (n < samples.length) n <<= 1;
  const buf = new Float64Array(n);
  const N = samples.length;
  for (let i = 0; i < N; i++) buf[i] = samples[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
  const mag = fftMag(buf);

  const lo = Math.ceil((minHz * n) / sampleRate), hi = Math.floor((maxHz * n) / sampleRate);
  for (let k = Math.max(lo, 1); k <= hi && k < mag.length; k++) {
    const f = (k * sampleRate) / n;
    const pc = (((Math.round(69 + 12 * Math.log2(f / 440)) % 12) + 12) % 12);
    chroma[pc] += mag[k] * mag[k];
  }
  const total = chroma.reduce((a, b) => a + b, 0);
  return total ? chroma.map((v) => v / total) : chroma;
}

/** Time (s, from window start) of the first frame whose energy reaches half the window max. */
export function onsetTime(samples: Float32Array, sampleRate: number, hop = 256): number | null {
  const energies: number[] = [];
  for (let i = 0; i + hop <= samples.length; i += hop) {
    let e = 0;
    for (let j = i; j < i + hop; j++) e += samples[j] * samples[j];
    energies.push(e);
  }
  const max = Math.max(...energies, 0);
  if (max < 1e-4) return null;
  return (energies.findIndex((e) => e >= max / 2) * hop) / sampleRate;
}
