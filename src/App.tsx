import { useEffect } from "react";
import { session, store } from "./engine/session";
import { useStore } from "./engine/store";
import { ChromaBars } from "./ui/ChromaBars";
import { Settings, Transport } from "./ui/Controls";
import { Progression } from "./ui/Progression";
import { TabLane } from "./ui/TabLane";

export default function App() {
  const s = useStore(store);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.code !== "Space" || t.closest("input, textarea, select, button")) return;
      e.preventDefault();
      session.toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <main>
      <header>
        <h1>Chord Coach</h1>
        <p className="muted">
          Pick your chords, press Start, and strum each chord as it crosses the line. Speakers are fine: the app ignores its own click.
        </p>
      </header>
      {s.error && <p className="error" role="alert">{s.error}</p>}
      {s.calibration && <p className="note" role="status">{s.calibration}</p>}
      <Transport s={s} />
      <TabLane />
      <Progression s={s} />
      <section>
        <h2>What the mic hears</h2>
        <ChromaBars s={s} />
      </section>
      <Settings s={s} />
    </main>
  );
}
