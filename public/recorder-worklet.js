// Posts mic audio to the main thread in 2048-sample blocks, tagged with the
// AudioContext frame index of the block's first sample.
const BLOCK = 2048;
class Recorder extends AudioWorkletProcessor {
  buf = new Float32Array(BLOCK);
  n = 0;
  process(inputs) {
    const ch = inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      this.buf[this.n++] = ch[i];
      if (this.n === BLOCK) {
        this.port.postMessage({ frame: currentFrame + i + 1 - BLOCK, samples: this.buf }, [this.buf.buffer]);
        this.buf = new Float32Array(BLOCK);
        this.n = 0;
      }
    }
    return true;
  }
}
registerProcessor("recorder", Recorder);
