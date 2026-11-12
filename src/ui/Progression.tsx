import { useState } from "react";
import { session, type Snapshot } from "../engine/session";
import { parseChart } from "../music/chart";

const ROOTS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const QUALITIES: [suffix: string, label: string][] = [
  ["", "maj"], ["m", "m"], ["7", "7"], ["m7", "m7"], ["maj7", "maj7"], ["sus2", "sus2"],
  ["sus4", "sus4"], ["add9", "add9"], ["6", "6"], ["dim", "dim"], ["aug", "aug"], ["5", "5"],
];
const PRESETS: [name: string, chart: string][] = [
  ["Pop (Am F C G)", "Am | F | C | G"],
  ["Pop in G", "G | D | Em | C"],
  ["50s (C Am F G)", "C | Am | F | G"],
  ["12-bar blues in A", "A7 | D7 | A7 | % | D7 | % | A7 | % | E7 | D7 | A7 | E7"],
  ["Beginner: G C D", "G | C | D | G"],
];

/** Build the chart by picking chords. The text field stays available for anything the buttons can't do. */
export function Progression({ s }: { s: Snapshot }) {
  const [root, setRoot] = useState("A");
  const locked = s.running;
  let bars: string[][] = [];
  let error: string | null = null;
  try {
    bars = parseChart(s.chartText, s.beatsPerBar).bars;
  } catch (e) {
    error = (e as Error).message;
  }
  const setBars = (b: string[][]) => session.update({ chartText: b.map((bar) => bar.join(" ")).join(" | ") });

  return (
    <div className="progression">
      <div className="chips">
        {bars.map((bar, b) => (
          <span key={b} className="chip">
            {bar.map((c, k) => (
              <button key={k} className="name" onClick={() => session.preview(c)} title={`Hear ${c}`}>
                {c}
              </button>
            ))}
            <span className="dots">
              {Array.from({ length: s.beatsPerBar }, (_, k) => (
                <i key={k} className={s.results[b * s.beatsPerBar + k]?.verdict ?? ""} />
              ))}
            </span>
            {!locked && (
              <button className="x" aria-label={`Remove bar ${b + 1}`} onClick={() => setBars(bars.filter((_, j) => j !== b))}>
                ×
              </button>
            )}
          </span>
        ))}
        {!bars.length && <span className="muted">Pick chords below, or a preset.</span>}
      </div>
      {error && s.chartText.trim() && <p className="error">{error}</p>}

      {!locked && (
        <>
          <div className="picker" role="group" aria-label="Root">
            {ROOTS.map((r) => (
              <button key={r} className={r === root ? "on" : ""} onClick={() => setRoot(r)}>
                {r}
              </button>
            ))}
          </div>
          <div className="picker" role="group" aria-label="Add chord">
            {QUALITIES.map(([q, label]) => (
              <button key={q} className="add" onClick={() => setBars([...bars, [root + q]])} title={`Add ${root}${q} as a new bar`}>
                + {root}
                <small>{label === "maj" ? "" : label}</small>
              </button>
            ))}
          </div>
          <div className="row">
            <select value="" onChange={(e) => e.target.value && session.update({ chartText: e.target.value })} aria-label="Presets">
              <option value="">Presets…</option>
              {PRESETS.map(([name, chart]) => (
                <option key={name} value={chart}>{name}</option>
              ))}
            </select>
            <button onClick={() => session.update({ chartText: "" })}>Clear</button>
            <input
              className="grow"
              value={s.chartText}
              onChange={(e) => session.update({ chartText: e.target.value })}
              aria-label="Chart text"
              placeholder="Am | F | C G | %"
            />
          </div>
        </>
      )}
    </div>
  );
}
