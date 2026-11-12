# Chord Coach

A practice tool for guitar. Type a chord chart (`Am | F | C | G`), then play along to the metronome. The mic scores every beat as a hit, a miss, or unsure, and the result shows on the chart.

Everything runs in the browser, and no audio leaves your device.

## Run it

```bash
npm install
npm run dev
```

Before your first session, press **Calibrate latency** and clap on each click. Headphones are not required: the app never scores its own metronome (see How it works).

## Chart syntax

- `|` or a newline separates bars. Chords that share a bar split its beats evenly: `C G` in 4/4 gives C two beats and G two beats.
- `%` repeats the previous bar.
- Supported qualities: major, `m`, `7`, `m7`, `maj7`, `sus2`, `sus4`, `dim`, `dim7`, `aug`, `6`, `m6`, `add9`, `5`, `m7b5`, and slash chords (`D/F#`).

## How it works

```
src/audio/clock.ts     Lookahead metronome on the AudioContext clock (not React state)
src/audio/mic.ts       getUserMedia -> AudioWorklet (public/recorder-worklet.js), raw blocks tagged by frame
src/audio/chroma.ts    FFT -> 12 pitch-class energies, 80 Hz to 1 kHz; onset detection for calibration
src/music/*            Chord parsing, chart parsing, per-beat scoring (pure, unit-tested)
src/engine/session.ts  Ties it together: beat windows, scoring, calibration, take recording
src/engine/detectors.ts  Pluggable detectors: audio window -> chroma[12] (`chroma`: FFT peaks; `basicPitch`: Spotify Basic Pitch note activations)
src/engine/window.ts     Which audio is scored for a beat; shared by the live session and the eval
src/audio/guitar.ts      Sampled acoustic guitar: playChord ("hear it") and renderChord (offline, also in Node)
src/engine/references.ts What each chord sounds like to each detector, from renderChord; cached
```

Each beat is scored over the window from 1/8 beat before the beat's real time to 1/2 beat after it, where real time = scheduled time + latency offset. When the click is audible (click volume above 0), `beatWindow(real, spb, clickAudible)` instead starts 100 ms after the click reaches the mic (`CLICK_MASK` in `src/engine/window.ts`), so the click itself is never scored; the click is an unpitched noise tick, and silent beats get no verdict. The mic stream also drives the metronome scheduler, so it keeps time when the tab is in the background.

## Scoring

The app knows what each chord sounds like. For every candidate chord (the chart's chords, all 24 majors and minors, and the common variations on the chart's roots) it strums the chord's usual voicing on a sampled guitar and runs that through the selected detector; the result is the chord's reference. A beat is a hit when it correlates with the expected chord's reference about as well as, or better than, with any other candidate's.

`scoreBeat(chroma, expectedName, refs, { threshold, floor })` in `src/music/scoring.ts` returns `{ verdict, ratio }`; `ratio` is a 0..1 confidence. Chords whose notes are a subset of each other (C and Cadd9, C and C/E, Am and Am7) count as the same chord and never compete. Tuned defaults:

| Knob | Default | Meaning |
| --- | --- | --- |
| `threshold` | 0.6 | hit at or above this confidence (the Hit threshold slider) |
| `floor` | 0.4 | miss below this confidence; in between is unsure |
| `SCORING.compress` | 0.5 | chroma is raised to this power before comparing |
| `SCORING.tie` | 0.7 | confidence when the expected chord ties the best other chord |
| `SCORING.gain` | 1.4 | confidence per unit of correlation margin (so a hit needs margin >= -0.07) |
| `SCORING.minMatch` | 0.4 | if no candidate correlates this well, the beat is a miss |

The `basicPitch` detector downloads TF.js (about 1 MB) and the model (0.9 MB, `public/basic-pitch/`) the first time it runs, not before. It takes about 55 ms per beat window in Chrome with WebGL on a laptop, after a first call of several seconds (11 s on the dev server) for loading and shader compilation.

## Evaluation set

Press **Record take** while you play, then press it again to download `take-*.wav` and `take-*.json` (with beat times, expected chords and `clickAudible`). Put both files in `takes/`. If you played something other than the chart on a beat, add `"played": "C"` to that beat. Then run `npm run eval` (or `npm run eval chroma` for one detector) to measure each detector with the same windowing and scoring as the live session. It prints the hit rate on correctly played beats, the false-hit rate on beats labeled with a different `played` chord, the false-hit rate had any other chord of the set been expected, and the most common confusions.

No real recordings exist yet, so the only numbers are from synthetic takes (`npm run gen-synthetic`). Treat them as a sanity check, not as the app's accuracy:

- `takes/synthetic/`: 10 takes, 160 beats, Karplus-Strong strings with open and barre voicings, strum spread, detune, room noise and 16 deliberately wrong beats. A timbre the references have never seen.
- `takes/synthetic-sampled/`: 5 takes, 80 beats, rendered with the app's own guitar samples. These are the same sounds the references are made from, so the result is optimistic.

Karplus-Strong set, correctly played beats hit / wrong-chord beats falsely hit / false hits against any other chord:

| Scoring | `chroma` | `basicPitch` |
| --- | --- | --- |
| Original: share of energy on the chord's notes | 82.6% / 25.0% / 16.4% | 100% / 50.0% / 20.1% |
| Reference sounds (current) | 99.3% / 0% / 0.9% | 97.9% / 0% / 0.1% |

On the sampled set both detectors hit 100% of correct beats and 0% of wrong ones. The original scorer accepted C for Am, G for Em and F for Dm (with `basicPitch`, C was accepted as Am on all 24 C beats); with reference sounds none of the wrong-chord beats in those pairs is accepted, and the remaining confusions are mostly sus2 and maj7 neighbours (Am as Asus2, D as Dsus2, Am as Cmaj7). In Node the Basic Pitch eval runs on the TF.js CPU backend at about 1.3 s per window, so the full eval takes around ten minutes.

## Credits

- Guitar samples (`public/guitar/notes.wav`): derived from the guitar-acoustic samples of [tonejs-instruments](https://github.com/nbrosowsky/tonejs-instruments) by Nicholaus P. Brosowsky, [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). Resampled to 32 kHz, trimmed, normalized and packed into one file by `scripts/vendor-guitar.ts`.
- [Basic Pitch](https://github.com/spotify/basic-pitch-ts) model and library, Spotify AB, Apache-2.0 (`public/basic-pitch/LICENSE`).
- Chord fingerings from [chords-db](https://github.com/tombatossals/chords-db), MIT.
