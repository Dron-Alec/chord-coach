// Offline accuracy check: every take (.wav + .json) in takes/ and its synthetic subfolders through each registered detector, using the
// same beat windowing and scoreBeat as the live session. npm run eval [detector...]
import "./public-fetch";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { decodeWav } from "../src/audio/wav";
import { detectors, type DetectorName } from "../src/engine/detectors";
import { chordReferences } from "../src/engine/references";
import { beatWindow } from "../src/engine/window";
import { chordPitchClasses } from "../src/music/chords";
import { candidateChords, sameChord, scoreBeat } from "../src/music/scoring";

type Label = {
  sampleRate: number;
  bpm: number;
  offsetSec: number;
  clickAudible?: boolean; // click played through speakers; scoring skips it
  beats: { index: number; time: number; chord: string; played?: string }[];
};

const pct = (n: number, of: number) => (of ? `${((100 * n) / of).toFixed(1)}%`.padStart(6) + ` (${n}/${of})` : "   n/a");

async function evalDir(dir: string, names: DetectorName[]) {
  const takes = readdirSync(dir)
    .filter((f) => f.endsWith(".wav") && existsSync(`${dir}/${f.slice(0, -4)}.json`))
    .map((f) => ({
      ...decodeWav(new Uint8Array(readFileSync(`${dir}/${f}`)).buffer),
      label: JSON.parse(readFileSync(`${dir}/${f.slice(0, -4)}.json`, "utf8")) as Label,
    }));
  const vocabulary = [...new Set(takes.flatMap((t) => t.label.beats.flatMap((b) => [b.chord, b.played ?? b.chord])))];
  const nBeats = takes.reduce((n, t) => n + t.label.beats.length, 0);
  console.log(`${takes.length} takes, ${nBeats} beats, ${vocabulary.length} distinct chords`);

  for (const name of names) {
    const refs = await chordReferences(name, candidateChords(vocabulary));
    const right = { hit: 0, uncertain: 0, miss: 0 }, wrong = { hit: 0, uncertain: 0, miss: 0 };
    const confusions = new Map<string, number>(); // "played -> accepted as"
    let crossHits = 0, crossTotal = 0, ms = 0, windows = 0;
    for (const { samples, sampleRate, label } of takes) {
      for (const beat of label.beats) {
        const [start, end] = beatWindow(beat.time + label.offsetSec, 60 / label.bpm, label.clickAudible).map((t) => Math.round(t * sampleRate));
        const audio = new Float32Array(end - start); // zero-filled past the ends of the file, like live
        audio.set(samples.subarray(Math.max(0, start), Math.max(0, end)), Math.max(0, -start));
        const t0 = performance.now();
        const chroma = await detectors[name](audio, sampleRate);
        if (windows++) ms += performance.now() - t0; // first window excluded: it pays for model loading

        const played = beat.played ?? beat.chord, playedPcs = chordPitchClasses(played);
        const { verdict } = scoreBeat(chroma, beat.chord, refs);
        (sameChord(playedPcs, chordPitchClasses(beat.chord)) ? right : wrong)[verdict]++;
        // Every other chord in the set, had the chart asked for it on this beat.
        for (const other of vocabulary) {
          if (sameChord(playedPcs, chordPitchClasses(other))) continue;
          crossTotal++;
          if (scoreBeat(chroma, other, refs).verdict !== "hit") continue;
          crossHits++;
          confusions.set(`${played}->${other}`, (confusions.get(`${played}->${other}`) ?? 0) + 1);
        }
      }
    }
    const nRight = right.hit + right.uncertain + right.miss, nWrong = wrong.hit + wrong.uncertain + wrong.miss;
    console.log(`\n  ${name}  (${(ms / Math.max(1, windows - 1)).toFixed(1)} ms/window)`);
    console.log(`    correctly played beats   hit ${pct(right.hit, nRight)}   uncertain ${pct(right.uncertain, nRight)}   miss ${pct(right.miss, nRight)}`);
    console.log(`    wrong-chord beats        false hit ${pct(wrong.hit, nWrong)}   uncertain ${pct(wrong.uncertain, nWrong)}   miss ${pct(wrong.miss, nWrong)}`);
    console.log(`    any other chord expected false hit ${pct(crossHits, crossTotal)}`);
    const top = [...confusions].sort((a, b) => b[1] - a[1]).slice(0, 12);
    console.log(`    confusions (played->accepted as): ${top.map(([k, n]) => `${k} ×${n}`).join(", ") || "none"}`);
  }
}

const names = (process.argv.slice(3).length ? process.argv.slice(3) : Object.keys(detectors)) as DetectorName[];
for (const n of names) if (!(n in detectors)) throw new Error(`Unknown detector ${n}; have ${Object.keys(detectors).join(", ")}`);

console.log("== Real takes (takes/*.wav): the metric that counts ==");
if (existsSync("takes") && readdirSync("takes").some((f) => f.endsWith(".wav"))) await evalDir("takes", names);
else console.log("none yet. Record some with the app's Record take button and put the .wav + .json in takes/.");

console.log("\n== Synthetic takes, Karplus-Strong strings (takes/synthetic): sanity check only, do not tune to these alone ==");
await evalDir("takes/synthetic", names);

console.log("\n== Synthetic takes, the app's own guitar samples (takes/synthetic-sampled): same sounds as the references, so optimistic ==");
await evalDir("takes/synthetic-sampled", names);
