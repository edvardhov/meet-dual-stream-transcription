/**
 * AudioWorklet that converts the merged stereo graph into interleaved 16-bit PCM.
 *
 * Left channel is the microphone, right is the Meet tab audio. Deepgram expects
 * linear16 at the context's 16 kHz rate.
 *
 * Kept as plain JS in public/ so Vite copies it verbatim. Bundling it inlines the
 * source as a data: URL that addModule() cannot parse, and the module-preload
 * polyfill Vite injects into entry chunks touches `document`, which does not
 * exist in AudioWorkletGlobalScope.
 */

const FRAMES_PER_CHUNK = 640; // 40 ms at 16 kHz

class PcmEncoderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.left = new Float32Array(FRAMES_PER_CHUNK);
    this.right = new Float32Array(FRAMES_PER_CHUNK);
    this.filled = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;

    // A muted mic track still delivers silence, so channel alignment holds.
    const left = input[0];
    const right = input.length > 1 ? input[1] : input[0];
    if (!left || !right) return true;

    for (let i = 0; i < left.length; i += 1) {
      this.left[this.filled] = left[i];
      this.right[this.filled] = right[i];
      this.filled += 1;

      if (this.filled === FRAMES_PER_CHUNK) {
        this.emit();
        this.filled = 0;
      }
    }
    return true;
  }

  emit() {
    const pcm = new Int16Array(FRAMES_PER_CHUNK * 2);
    for (let i = 0; i < FRAMES_PER_CHUNK; i += 1) {
      const l = Math.max(-1, Math.min(1, this.left[i]));
      const r = Math.max(-1, Math.min(1, this.right[i]));
      pcm[i * 2] = l < 0 ? l * 0x8000 : l * 0x7fff;
      pcm[i * 2 + 1] = r < 0 ? r * 0x8000 : r * 0x7fff;
    }
    this.port.postMessage(pcm.buffer, [pcm.buffer]);
  }
}

registerProcessor("pcm-encoder", PcmEncoderProcessor);
