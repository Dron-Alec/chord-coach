/** Mono 16-bit PCM WAV. */
export function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); str(8, "WAVE");
  str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) => v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 0x7fff, true));
  return buf;
}

/** Inverse of encodeWav (mono or first channel of 16-bit PCM). Used by the eval harness. */
export function decodeWav(buf: ArrayBuffer): { samples: Float32Array; sampleRate: number } {
  const v = new DataView(buf);
  let o = 12, sampleRate = 0, channels = 1;
  while (o < v.byteLength) {
    const id = String.fromCharCode(...new Uint8Array(buf, o, 4));
    const size = v.getUint32(o + 4, true);
    if (id === "fmt ") {
      channels = v.getUint16(o + 10, true);
      sampleRate = v.getUint32(o + 12, true);
      if (v.getUint16(o + 22, true) !== 16) throw new Error("Only 16-bit PCM WAV supported");
    } else if (id === "data") {
      const n = Math.floor(size / 2 / channels);
      const samples = new Float32Array(n);
      for (let i = 0; i < n; i++) samples[i] = v.getInt16(o + 8 + i * 2 * channels, true) / 0x8000;
      return { samples, sampleRate };
    }
    o += 8 + size + (size % 2);
  }
  throw new Error("No data chunk");
}
