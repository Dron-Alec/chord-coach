import { store } from "./engine/session";
import { useStore } from "./engine/store";
import { ChartView } from "./ui/ChartView";
import { ChromaBars } from "./ui/ChromaBars";
import { Controls } from "./ui/Controls";

export default function App() {
  const s = useStore(store);
  const scored = s.stats.hit + s.stats.miss + s.stats.uncertain;
  return (
    <main>
      <header>
        <h1>Chord Coach</h1>
        <p className="muted">Play along to the click. Each beat is scored from your mic. Wear headphones, or the click bleeds into the mic.</p>
      </header>
      {s.error && <p className="error" role="alert">{s.error}</p>}
      {s.calibration && <p className="note" role="status">{s.calibration}</p>}
      <Controls s={s} />
      <section>
        <ChartView s={s} />
        {scored > 0 && (
          <p className="stats">
            <b>{Math.round((s.stats.hit / scored) * 100)}%</b> hit · {s.stats.hit} hit · {s.stats.miss} miss · {s.stats.uncertain} unsure
          </p>
        )}
      </section>
      <section>
        <h2>What the mic hears</h2>
        <ChromaBars s={s} />
      </section>
    </main>
  );
}
