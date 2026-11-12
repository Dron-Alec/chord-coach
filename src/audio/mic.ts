export type Mic = { stream: MediaStream; node: AudioWorkletNode; inputLatency: number };

/** Mic -> recorder worklet only. Never connected to destination (feedback). */
export async function openMic(ctx: AudioContext, onBlock: (frame: number, samples: Float32Array) => void): Promise<Mic> {
  const stream = await navigator.mediaDevices.getUserMedia({
    // Voice processing wrecks music: it gates, compresses, and filters the strum.
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  await ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL}recorder-worklet.js`);
  const node = new AudioWorkletNode(ctx, "recorder", { numberOfInputs: 1, numberOfOutputs: 0 });
  node.port.onmessage = (e) => onBlock(e.data.frame, e.data.samples);
  ctx.createMediaStreamSource(stream).connect(node);
  const settings = stream.getAudioTracks()[0].getSettings() as MediaTrackSettings & { latency?: number };
  return { stream, node, inputLatency: settings.latency ?? 0 };
}

export function closeMic(mic: Mic) {
  mic.node.disconnect();
  mic.stream.getTracks().forEach((t) => t.stop());
}
