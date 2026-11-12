import { session, type Snapshot } from "../engine/session";
import { detectors, type DetectorName } from "../engine/detectors";

const num = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => Number(e.target.value);

export function Controls({ s }: { s: Snapshot }) {
  const locked = s.running;
  return (
    <div className="controls">
      <label className="wide">
        Chart
        <textarea
          rows={2}
          value={s.chartText}
          disabled={locked}
          onChange={(e) => session.update({ chartText: e.target.value })}
          placeholder="Am | F | C | G"
        />
      </label>
      <label>
        BPM
        <input type="number" min={30} max={240} value={s.bpm} disabled={locked} onChange={(e) => session.update({ bpm: num(e) })} />
      </label>
      <label>
        Time
        <select value={s.beatsPerBar} disabled={locked} onChange={(e) => session.update({ beatsPerBar: num(e) })}>
          <option value={4}>4/4</option>
          <option value={3}>3/4</option>
        </select>
      </label>
      <label>
        Detector
        <select value={s.detector} onChange={(e) => session.update({ detector: e.target.value as DetectorName })}>
          {Object.keys(detectors).map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
      </label>
      <label>
        Click vol
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
        {s.running ? (
          <button className="primary" onClick={() => session.stop()}>Stop</button>
        ) : (
          <>
            <button className="primary" onClick={() => session.start("play")}>Play</button>
            <button onClick={() => session.start("calibrate")}>Calibrate latency</button>
          </>
        )}
        <button onClick={() => session.toggleRecording()} className={s.recording ? "rec" : ""}>
          {s.recording ? "■ Save take" : "● Record take"}
        </button>
      </div>
    </div>
  );
}
