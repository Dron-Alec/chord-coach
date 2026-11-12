import { expect, it } from "vitest";
import { strumOnset } from "./onset";

// Real playing: the same chord re-strummed every beat while the last strum still rings.
it("finds re-strums over a chord that is still ringing", () => {
  const SR = 48000, spb = 0.75, n = 8;
  const s = new Float32Array(SR * spb * (n + 1));
  const freqs = [98, 123.5, 146.8, 196, 246.9, 392];
  for (let b = 0; b < n; b++) {
    const amp = b % 2 ? 0.06 : 0.1; // upstrums quieter
    freqs.forEach((f, k) => {
      const start = Math.round((spb * (b + 0.5) + k * 0.008) * SR);
      for (let i = start; i < s.length; i++) {
        const t = (i - start) / SR;
        s[i] += amp * Math.exp(-1.2 * t) * Math.sin(2 * Math.PI * f * 1.002 ** k * t);
        if (t < 0.004) s[i] += amp * 0.5 * (Math.random() * 2 - 1); // pick noise
      }
    });
  }
  const found: (number | null)[] = [];
  for (let b = 1; b < n; b++) {
    const beat = spb * (b + 0.5), reach = 0.2;
    const o = strumOnset(s.subarray(Math.round((beat - reach) * SR), Math.round((beat + reach) * SR)), SR);
    found.push(o === null ? null : Math.round((o - reach) * 1000));
  }
  // Every strum found. Quiet upstrums over a loud ring are timed up to ~30 ms late (each string adds
  // little energy), still inside the 50 ms "Perfect" window.
  for (const ms of found) expect(ms !== null && Math.abs(ms) < 35, `onsets ${found.join(" ")}`).toBe(true);
});
