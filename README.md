# Chord Coach

A practice tool for guitar. Type a chord chart (`Am | F | C | G`), then play along to the metronome. The mic scores every beat as a hit, a miss, or unsure, and the result shows on the chart.

Everything runs in the browser, and no audio leaves your device.

## Run it

```bash
npm install
npm run dev
```

Use headphones. Otherwise the click bleeds into the mic and gets scored. Before your first session, press **Calibrate latency** and clap on each click.

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
src/engine/detectors.ts  Pluggable detectors: audio window -> chroma[12]
```

Each beat is scored over the window from 1/8 beat before the beat's real time to 1/2 beat after it, where real time = scheduled time + latency offset. The mic stream also drives the metronome scheduler, so it keeps time when the tab is in the background.

## Evaluation set

Press **Record take** while you play, then press it again to download `take-*.wav` and `take-*.json` (with beat times and expected chords). Put both files in `takes/`, fix any beats where you played something else, and run `npm run eval` to measure accuracy for each detector.
