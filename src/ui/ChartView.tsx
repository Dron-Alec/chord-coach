import type { Snapshot } from "../engine/session";

export function ChartView({ s }: { s: Snapshot }) {
  if (!s.chart) return <p className="muted">Press Play to load the chart.</p>;
  const { bars, beatsPerBar, beats } = s.chart;
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
