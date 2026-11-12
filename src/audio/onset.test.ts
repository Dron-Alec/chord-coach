import { describe, expect, it } from "vitest";
import { judge, strumOnset } from "./onset";

const SR = 48000;
const strumAt = (sec: number, len = 0.4, withTick = true) => {
  const s = new Float32Array(SR * len);
  if (withTick) for (let i = 0; i < SR * 0.03; i++) s[i] = (i % 2 ? 1 : -1) * 0.5 * Math.exp(-i / 300); // tick at t=0, near Nyquist
  const start = Math.round(sec * SR);
  for (let i = start; i < s.length; i++) {
    const t = (i - start) / SR;
    for (const f of [110, 146.8, 196, 246.9]) s[i] += 0.1 * Math.exp(-3 * t) * Math.sin(2 * Math.PI * f * t);
  }
  return s;
};

describe("strumOnset", () => {
  it("finds the strum, not the metronome tick before it", () => {
    expect(Math.abs(strumOnset(strumAt(0.15), SR)! - 0.15)).toBeLessThan(0.03);
  });
  it("ringing chord with no new strum is null", () => {
    const ringing = strumAt(0, 1.2, false).subarray(SR * 0.6);
    expect(strumOnset(ringing, SR)).toBeNull();
  });
  it("late strum after a tick out of silence is the strum, not the tick", () => {
    const s = new Float32Array(SR * 0.4);
    for (let i = 0; i < SR * 0.03; i++) s[i] = Math.sin((2 * Math.PI * 3000 * i) / SR) * Math.exp(-i / 300); // loud accent tick
    const late = strumAt(0.32, 0.4, false).subarray(0, SR * 0.4);
    for (let i = 0; i < s.length; i++) s[i] += late[i] ?? 0;
    expect(Math.abs(strumOnset(s, SR)! - 0.32)).toBeLessThan(0.03);
  });
  it("a rolled strum is timed from its first string", () => {
    const s = new Float32Array(SR * 0.5);
    [110, 146.8, 196, 246.9, 329.6, 392].forEach((f, k) => {
      const start = Math.round((0.2 + k * 0.015) * SR); // 6 strings, 15 ms apart, from 200 ms
      for (let i = start; i < s.length; i++) s[i] += 0.1 * Math.exp((-3 * (i - start)) / SR) * Math.sin((2 * Math.PI * f * (i - start)) / SR);
    });
    expect(Math.abs(strumOnset(s, SR)! - 0.2)).toBeLessThan(0.02);
  });
  it("silence is null", () => expect(strumOnset(new Float32Array(SR / 2), SR)).toBeNull());
});

describe("judge", () => {
  it.each([
    ["hit", 0.02, "perfect"], ["hit", -0.12, "early"], ["hit", 0.12, "late"],
    ["hit", null, "hold"], ["miss", 0, "not-quite"], ["uncertain", 0, "not-quite"], ["uncertain", null, null],
  ] as const)("%s at %s -> %s", (v, t, j) => expect(judge(v, t)).toBe(j));
});
