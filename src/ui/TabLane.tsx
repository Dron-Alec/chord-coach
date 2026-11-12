import { useEffect, useRef } from "react";
import { session, store, type Lane } from "../engine/session";
import { parseChart } from "../music/chart";
import { voicing } from "../music/voicings";
import { JUDGMENT_LABEL, type Judgment } from "../audio/onset";
import type { BeatResult } from "../engine/session";

const POPUP_MS = 900;
const firstSeen = new WeakMap<BeatResult, number>(); // when each result appeared, for the popup animation

const PX_PER_BEAT = 80;
const PLAYHEAD_X = 140;
const TOP = 40; // chord names above the staff
const STRING_GAP = 22;
const HEIGHT = TOP + STRING_GAP * 5 + 44;

/** Guitar tab scrolling right to left. A chord is due when its column crosses the fixed playhead line. */
export function TabLane() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const g = canvas.getContext("2d")!;
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      if (canvas.width !== Math.round(w * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(HEIGHT * dpr);
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(g, w, session.lane() ?? idleLane());
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={ref} className="lane" style={{ height: HEIGHT }} aria-label="Scrolling chord tab" />;
}

let idleCache: { key: string; lane: Lane | null } = { key: "", lane: null };
/** Stopped: show the chart parked just right of the playhead. */
function idleLane(): Lane | null {
  const s = store.get();
  const key = `${s.chartText}|${s.beatsPerBar}|${s.bpm}`;
  if (idleCache.key !== key) {
    let lane: Lane | null = null;
    try {
      const spb = 60 / s.bpm;
      lane = { chart: parseChart(s.chartText, s.beatsPerBar), now: -spb, chartStart: 0, spb, history: new Map(), idle: true };
    } catch {
      /* invalid chart: the editor shows the error */
    }
    idleCache = { key, lane };
  }
  return idleCache.lane;
}

function css(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function draw(g: CanvasRenderingContext2D, w: number, lane: Lane | null) {
  const c = { fg: css("--fg"), muted: css("--muted"), line: css("--line"), accent: css("--accent"), card: css("--card"),
    hit: css("--hit"), miss: css("--miss"), timing: css("--timing") };
  const judgmentColor: Record<Judgment, string> = { perfect: c.hit, hold: c.hit, early: c.timing, late: c.timing, "not-quite": c.miss };
  g.fillStyle = c.card;
  g.fillRect(0, 0, w, HEIGHT);
  const stringY = (s: number) => TOP + s * STRING_GAP; // 0 = high e (top line, as in tab)

  g.strokeStyle = c.line;
  g.lineWidth = 1;
  for (let s = 0; s < 6; s++) {
    g.beginPath();
    g.moveTo(0, stringY(s) + 0.5);
    g.lineTo(w, stringY(s) + 0.5);
    g.stroke();
  }
  if (!lane) return;

  const { chart, now, chartStart, spb, history } = lane;
  const n = chart.beats.length;
  const pos = (now - chartStart) / spb; // current position in chart beats (fractional)
  const xOf = (b: number) => PLAYHEAD_X + (b - pos) * PX_PER_BEAT;
  const first = Math.floor(pos - PLAYHEAD_X / PX_PER_BEAT) - 1;
  const last = Math.ceil(pos + (w - PLAYHEAD_X) / PX_PER_BEAT) + 1;
  const staffBottom = stringY(5);

  // Playhead, under the fret numbers so they stay readable as they cross it.
  g.strokeStyle = c.accent;
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(PLAYHEAD_X, 8);
  g.lineTo(PLAYHEAD_X, HEIGHT - 8);
  g.stroke();

  // Count-in numbers.
  if (pos < 0 && !lane.idle) {
    g.fillStyle = c.accent;
    g.font = "700 28px system-ui, sans-serif";
    g.textAlign = "center";
    g.fillText(String(chart.beatsPerBar + Math.floor(pos) + 1), PLAYHEAD_X, staffBottom + 36);
  }

  for (let b = Math.max(first, 0); b <= last; b++) {
    const x = xOf(b);
    const i = b % n;
    const chord = chart.beats[i];
    const barStart = i % chart.beatsPerBar === 0;
    const changes = chart.starts[i];

    if (barStart) {
      g.strokeStyle = c.muted;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x - PX_PER_BEAT * 0.35, stringY(0));
      g.lineTo(x - PX_PER_BEAT * 0.35, staffBottom);
      g.stroke();
    }

    const active = pos >= b && pos < b + 1;
    if (changes) {
      // How long this chord lasts from here.
      let len = 1;
      while (len < n && chart.beats[(i + len) % n] === chord && (i + len) % chart.beatsPerBar !== 0) len++;
      const live = pos >= b && pos < b + len;
      g.fillStyle = live ? c.accent : c.fg;
      g.font = `700 ${live ? 20 : 17}px system-ui, sans-serif`;
      g.textAlign = "left";
      g.fillText(chord, x - 8, TOP - 16);

      const frets = voicing(chord).frets; // low E -> high e
      g.font = "600 14px ui-monospace, monospace";
      g.textAlign = "center";
      g.textBaseline = "middle";
      for (let s = 0; s < 6; s++) {
        const f = frets[5 - s];
        const y = stringY(s);
        const label = f < 0 ? "x" : String(f);
        const bw = label.length * 9 + 6;
        g.fillStyle = c.card;
        g.fillRect(x - bw / 2, y - 8, bw, 16);
        g.fillStyle = f < 0 ? c.muted : live ? c.accent : c.fg;
        g.fillText(label, x, y);
      }
      g.textBaseline = "alphabetic";
    }

    // Strum marker under each chord; colored once it is judged.
    if (!changes) continue;
    const r = history.get(b);
    g.fillStyle = r ? judgmentColor[r.judgment] : active ? c.accent : c.line;
    g.beginPath();
    g.arc(x, staffBottom + 22, r ? 7 : 5, 0, Math.PI * 2);
    g.fill();
  }


  // Feedback popup for the latest strum: rises and fades next to the playhead.
  const t = performance.now();
  let latest: BeatResult | null = null, latestAt = 0;
  for (const res of history.values()) {
    if (!firstSeen.has(res)) firstSeen.set(res, t);
    const at = firstSeen.get(res)!;
    if (at >= latestAt) [latest, latestAt] = [res, at];
  }
  const age = (t - latestAt) / POPUP_MS;
  if (latest && age < 1) {
    const ms = latest.timing === null ? "" : ` ${latest.timing > 0 ? "+" : ""}${Math.round(latest.timing * 1000)}ms`;
    g.globalAlpha = 1 - age * age;
    g.fillStyle = judgmentColor[latest.judgment];
    g.font = `800 ${24 + 6 * (1 - age)}px system-ui, sans-serif`;
    g.textAlign = "left";
    g.fillText(JUDGMENT_LABEL[latest.judgment], PLAYHEAD_X + 16, TOP + STRING_GAP * 2.6 - age * 24);
    if (latest.judgment === "early" || latest.judgment === "late") {
      g.font = "600 13px system-ui, sans-serif";
      g.fillText(ms.trim(), PLAYHEAD_X + 18, TOP + STRING_GAP * 2.6 + 18 - age * 24);
    }
    g.globalAlpha = 1;
  }
}
