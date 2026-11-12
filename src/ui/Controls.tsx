import { session, type Snapshot } from "../engine/session";
import { detectors, type DetectorName } from "../engine/detectors";

const num = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => Number(e.target.value);

export function Transport({ s }: { s: Snapshot }) {
  const scored = s.stats.hit + s.stats.miss + s.stats.uncertain;
  return (
    <div className="transport">
      <button className={`primary big ${s.running ? "stop" : ""}`} onClick={() => session.toggle()}>
        {s.running ? "■ Stop" : "▶ Start"}
      </button>
      <label>
        BPM
        <input type="number" min={30} max={240} value={s.bpm} disabled={s.running} onChange={(e) => session.update({ bpm: num(e) })} />
      </label>
      <label>
        Time
        <select value={s.beatsPerBar} disabled={s.running} onChange={(e) => session.update({ beatsPerBar: num(e) })}>
          <option value={4}>4/4</option>
          <option value={3}>3/4</option>
        </select>
      </label>
      <span className="muted hint">Space starts and stops</span>
      {scored > 0 && (
        <span className="stats">
          <b>{Math.round((s.stats.hit / scored) * 100)}%</b> · {s.stats.hit} hit · {s.stats.miss} miss · {s.stats.uncertain} unsure
        </span>
      )}
    </div>
  );
}

export function Settings({ s }: { s: Snapshot }) {
  return (
    <details className="settings">
      <summary>Settings, latency and recording</summary>
      <div className="controls">
        <label>
          Detector
          <select value={s.detector} onChange={(e) => session.update({ detector: e.target.value as DetectorName })}>
            {Object.keys(detectors).map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
        <label>
          Click volume
          <input type="range" min={0} max={1} step={0.05} value={s.clickVolume} onChange={(e) => session.update({ clickVolume: num(e) })} />
        </label>
        <label>
          Hit threshold {Math.round(s.threshold * 100)}%
          <input type="range" min={0.3} max={0.9} step={0.05} value={s.threshold} onChange={(e) => session.update({ threshold: num(e) })} />
        </label>
        <label>
          Latency {s.offsetMs} ms
          <input type="range" min={0} max={400} step={5} value={s.offsetMs} onChange={(e) => session.update({ offsetMs: num(e) })} />
        </label>
        <div className="buttons">
          <button disabled={s.running} onClick={() => session.start("calibrate")}>Calibrate latency (clap on 8 clicks)</button>
          <button onClick={() => session.toggleRecording()} className={s.recording ? "rec" : ""}>
            {s.recording ? "■ Save take" : "● Record take"}
          </button>
        </div>
      </div>
    </details>
  );
}
