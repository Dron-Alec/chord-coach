import type { Snapshot } from "../engine/session";
import { parseChart, type Chart } from "../music/chart";

export function ChartView({ s }: { s: Snapshot }) {
  let chart: Chart | null = s.chart;
  if (!s.running) {
    try {
      chart = parseChart(s.chartText, s.beatsPerBar);
    } catch (e) {
      return <p className="error">{(e as Error).message}</p>;
    }
  }
  if (!chart) return null;
  const { bars, beatsPerBar, beats } = chart;
  const cur = s.beat >= 0 ? s.beat % beats.length : -1;
  return (
    <div className="chart">
      {bars.map((bar, b) => (
        <div key={b} className={`bar ${Math.floor(cur / beatsPerBar) === b ? "active" : ""}`}>
          <div className="chords">
            {bar.map((c, i) => (
              <span key={i}>{c}</span>
            ))}
          </div>
          <div className="beats">
            {Array.from({ length: beatsPerBar }, (_, k) => {
              const i = b * beatsPerBar + k;
              const r = s.results[i];
              return (
                <span
                  key={k}
                  className={`dot ${r?.verdict ?? ""} ${i === cur ? "now" : ""}`}
                  title={r ? `${r.chord}: ${r.verdict} (${Math.round(r.ratio * 100)}% in chord)` : beats[i]}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
