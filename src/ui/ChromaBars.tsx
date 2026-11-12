import { chordPitchClasses, PC_NAMES } from "../music/chords";
import type { Snapshot } from "../engine/session";

/** Live pitch-class energy from the mic; expected chord tones highlighted. */
export function ChromaBars({ s }: { s: Snapshot }) {
  const chord = s.chart && s.beat >= 0 ? s.chart.beats[s.beat % s.chart.beats.length] : null;
  const expected = chord ? chordPitchClasses(chord) : new Set<number>();
  const max = Math.max(...s.liveChroma, 0.01);
  return (
    <div className="chroma" aria-label="Live pitch classes">
      {s.liveChroma.map((v, i) => (
        <div key={i} className={`pc ${expected.has(i) ? "expected" : ""}`}>
          <div className="fill" style={{ height: `${(v / max) * 100}%` }} />
          <span>{PC_NAMES[i]}</span>
        </div>
      ))}
    </div>
  );
}
