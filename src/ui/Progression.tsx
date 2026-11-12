import { useEffect, useRef, useState } from "react";
import { session, type Snapshot } from "../engine/session";
import { parseChart } from "../music/chart";

const PALETTE = ["C", "D", "E", "F", "G", "A", "Am", "Bm", "Dm", "Em", "F#m", "A7", "B7", "D7", "E7", "G7", "Cmaj7", "Fmaj7", "Am7", "Em7", "Dsus4", "Asus2"];
const ROOTS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const QUALITIES: [suffix: string, label: string][] = [
  ["", "major"], ["m", "m"], ["7", "7"], ["m7", "m7"], ["maj7", "maj7"], ["sus2", "sus2"], ["sus4", "sus4"],
  ["add9", "add9"], ["6", "6"], ["m6", "m6"], ["dim", "dim"], ["dim7", "dim7"], ["aug", "aug"], ["5", "5"], ["m7b5", "m7b5"],
];
const PRESETS: [name: string, chart: string][] = [
  ["Pop (Am F C G)", "Am | F | C | G"],
  ["Pop in G (G D Em C)", "G | D | Em | C"],
  ["50s (C Am F G)", "C | Am | F | G"],
  ["Bm workout (Bm G D A)", "Bm | G | D | A"],
  ["12-bar blues in A", "A7 | D7 | A7 | % | D7 | % | A7 | % | E7 | D7 | A7 | E7"],
  ["Beginner (G C D)", "G | C | D | G"],
];

type Drop = { kind: "insert" | "replace"; index: number } | { kind: "remove" } | null;
type Drag = { chord: string; from: number | null; x: number; y: number; drop: Drop };

/** Where a drag at (x, y) would land: between bars inserts, onto a bar replaces, outside removes a dragged bar. */
function dropAt(x: number, y: number, from: number | null, barCount: number): Drop {
  const el = document.elementFromPoint(x, y);
  const chip = el?.closest<HTMLElement>(".chip[data-i]");
  if (chip) {
    const i = Number(chip.dataset.i);
    const r = chip.getBoundingClientRect();
    const f = (x - r.left) / r.width;
    if (from === null && f > 0.3 && f < 0.7) return { kind: "replace", index: i };
    return { kind: "insert", index: f < 0.5 ? i : i + 1 };
  }
  if (el?.closest(".chips")) return { kind: "insert", index: barCount };
  return from === null ? null : { kind: "remove" };
}

/** Build the chart by dragging chords in (or tapping them). The text field is there for anything else. */
export function Progression({ s }: { s: Snapshot }) {
  const [root, setRoot] = useState("B");
  const [quality, setQuality] = useState("m");
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;
  const locked = s.running;

  let bars: string[][] = [];
  let error: string | null = null;
  try {
    bars = parseChart(s.chartText, s.beatsPerBar).bars;
  } catch (e) {
    error = (e as Error).message;
  }
  const barsRef = useRef(bars);
  barsRef.current = bars;
  const setBars = (b: string[][]) => session.update({ chartText: b.map((bar) => bar.join(" ")).join(" | ") });

  /** Press on a chord: a tap plays/adds it, moving more than a few px starts a drag. */
  const press = (chord: string, from: number | null) => (e: React.PointerEvent) => {
    if (locked || e.button !== 0) return;
    const x0 = e.clientX, y0 = e.clientY;
    let dragging = false;
    const move = (ev: PointerEvent) => {
      if (!dragging && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
      dragging = true;
      setDrag({ chord, from, x: ev.clientX, y: ev.clientY, drop: dropAt(ev.clientX, ev.clientY, from, barsRef.current.length) });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      const d = dragRef.current;
      setDrag(null);
      if (!dragging) {
        void session.preview(chord);
        if (from === null) setBars([...barsRef.current, [chord]]); // tap on a palette chord adds a bar
        return;
      }
      if (d?.drop) setBars(applyDrop(barsRef.current, d.chord, d.from, d.drop));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  // Escape cancels a drag.
  useEffect(() => {
    if (!drag) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setDrag(null);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [drag]);

  const custom = root + quality;
  const marker = (i: number) =>
    drag?.drop?.kind === "replace" && drag.drop.index === i ? "drop-replace"
    : drag?.drop?.kind === "insert" && drag.drop.index === i ? "drop-before"
    : drag?.drop?.kind === "insert" && drag.drop.index === i + 1 && i === bars.length - 1 ? "drop-after"
    : "";

  return (
    <div className={`progression ${drag ? "dragging" : ""}`}>
      <div className="chips">
        {bars.map((bar, b) => (
          <span
            key={b}
            data-i={b}
            className={`chip ${marker(b)} ${drag?.from === b ? "lifted" : ""}`}
            onPointerDown={bar.length === 1 ? press(bar[0], b) : undefined}
            title={locked ? undefined : "Tap to hear, drag to move, drag off to remove"}
          >
            {bar.map((c, k) => (
              <span key={k} className="name" onPointerDown={bar.length > 1 ? press(c, null) : undefined}>
                {c}
              </span>
            ))}
            <span className="dots">
              {Array.from({ length: s.beatsPerBar }, (_, k) => (
                <i key={k} className={s.results[b * s.beatsPerBar + k]?.judgment ?? ""} />
              ))}
            </span>
            {!locked && (
              <button
                className="x"
                aria-label={`Remove bar ${b + 1}`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => setBars(bars.filter((_, j) => j !== b))}
              >
                ×
              </button>
            )}
          </span>
        ))}
        {!bars.length && <span className="muted drop-hint">Drag chords here, or tap them.</span>}
      </div>
      {error && s.chartText.trim() && <p className="error">{error}</p>}

      {!locked && (
        <>
          <div className="palette" aria-label="Chords: drag into the progression or tap to add">
            {PALETTE.map((c) => (
              <span key={c} className="tile" onPointerDown={press(c, null)} role="button" tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && setBars([...bars, [c]])}>
                {c}
              </span>
            ))}
          </div>
          <div className="row">
            <select value={root} onChange={(e) => setRoot(e.target.value)} aria-label="Root">
              {ROOTS.map((r) => <option key={r}>{r}</option>)}
            </select>
            <select value={quality} onChange={(e) => setQuality(e.target.value)} aria-label="Quality">
              {QUALITIES.map(([q, label]) => <option key={q} value={q}>{label}</option>)}
            </select>
            <span className="tile" onPointerDown={press(custom, null)} role="button" tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && setBars([...bars, [custom]])} title="Drag or tap">
              {custom}
            </span>
            <select value="" onChange={(e) => e.target.value && session.update({ chartText: e.target.value })} aria-label="Presets">
              <option value="">Presets…</option>
              {PRESETS.map(([name, chart]) => <option key={name} value={chart}>{name}</option>)}
            </select>
            <button onClick={() => session.update({ chartText: "" })}>Clear</button>
          </div>
          <input
            className="chart-text"
            value={s.chartText}
            onChange={(e) => session.update({ chartText: e.target.value })}
            aria-label="Chart text"
            placeholder="Am | F | C G | %   (two chords in a bar split it)"
          />
        </>
      )}

      {drag && (
        <span className={`tile ghost ${drag.drop?.kind === "remove" ? "removing" : ""}`} style={{ left: drag.x, top: drag.y }}>
          {drag.drop?.kind === "remove" ? `✕ ${drag.chord}` : drag.chord}
        </span>
      )}
    </div>
  );
}

function applyDrop(bars: string[][], chord: string, from: number | null, drop: NonNullable<Drop>): string[][] {
  const next = bars.slice();
  if (drop.kind === "remove") return next.filter((_, i) => i !== from);
  if (drop.kind === "replace") {
    next[drop.index] = [chord];
    return next;
  }
  let at = drop.index;
  if (from !== null) {
    next.splice(from, 1);
    if (from < at) at--;
    next.splice(at, 0, bars[from]);
  } else next.splice(at, 0, [chord]);
  return next;
}
