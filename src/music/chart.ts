import { chordPitchClasses } from "./chords";

export type Chart = {
  beatsPerBar: number;
  bars: string[][]; // chords as written in each bar
  beats: string[]; // one chord name per beat, the whole chart
  starts: boolean[]; // per beat: a chord as written begins here (where it is judged)
};

/**
 * "Am | F | C G | G7" -> one entry per beat. Chords sharing a bar split its beats
 * evenly; any remainder goes to the first chord. "%" repeats the previous bar.
 */
export function parseChart(text: string, beatsPerBar = 4): Chart {
  const bars: string[][] = [];
  for (const raw of text.split(/[|\n]/)) {
    const tokens = raw.trim().split(/\s+/).filter(Boolean);
    if (!tokens.length) continue;
    if (tokens.length === 1 && tokens[0] === "%") {
      if (!bars.length) throw new Error("% with no previous bar");
      bars.push(bars[bars.length - 1]);
      continue;
    }
    if (tokens.length > beatsPerBar) throw new Error(`Too many chords in bar: ${raw.trim()}`);
    tokens.forEach(chordPitchClasses); // validate
    bars.push(tokens);
  }
  if (!bars.length) throw new Error("Empty chart");

  const beats: string[] = [];
  const starts: boolean[] = [];
  for (const bar of bars) {
    const each = Math.floor(beatsPerBar / bar.length);
    const extra = beatsPerBar - each * bar.length;
    bar.forEach((c, i) => {
      const len = each + (i === 0 ? extra : 0);
      beats.push(...Array(len).fill(c));
      starts.push(true, ...Array(len - 1).fill(false));
    });
  }
  return { beatsPerBar, bars, beats, starts };
}
