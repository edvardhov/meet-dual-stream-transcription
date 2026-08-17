import { RingBuffer } from "../shared/pcm";
import type { TranscriptItem } from "../shared/types";

export interface PipelineConfig {
  streamId: string;
  sessionId: string;
  wsUrl: string;
  onTranscript: (item: TranscriptItem) => void;
  onVu: (mic: number, meeting: number) => void;
  onError: (message: string) => void;
}

export class AudioPipeline {
  private playbackCtx: AudioContext | null = null;
  private captureCtx: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private tabStream: MediaStream | null = null;
  private micTrack: MediaStreamTrack | null = null;
  private micGain: GainNode | null = null;
  private ws: WebSocket | null = null;
  private sendQueue = new RingBuffer<ArrayBuffer>(32);
  private sendTimer: number | null = null;
  private micVu = 0;
  private meetingVu = 0;
  private extensionMuted = false;
  private meetMuted: boolean | null = null;
  private startedAt = Date.now();

  private applyEffectiveMute(): void {
    const effectiveMuted = this.extensionMuted || this.meetMuted === true;
    if (!this.micTrack || !this.micGain || !this.captureCtx) return;
    if (effectiveMuted) {
      this.micTrack.enabled = false;
      this.micGain.gain.setTargetAtTime(0, this.captureCtx.currentTime, 0.015);
    } else {
      this.micTrack.enabled = true;
      this.micGain.gain.setTargetAtTime(1, this.captureCtx.currentTime, 0.015);
    }
  }

  private async openMicStream(): Promise<MediaStream> {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotAllowedError") {
        throw new Error(
          "Microphone permission is not granted to the extension. Click Enable microphone, choose Allow in the tab that opens, then try again.",
        );
      }
      throw error;
    }
  }

  async start(config: PipelineConfig): Promise<void> {
    this.startedAt = Date.now();
    this.tabStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: "tab",
          chromeMediaSourceId: config.streamId,
        },
      } as MediaTrackConstraints,
      video: false,
    });

    this.playbackCtx = new AudioContext();
    this.playbackCtx.createMediaStreamSource(this.tabStream).connect(this.playbackCtx.destination);

    this.micStream = await this.openMicStream();
    this.micTrack = this.micStream.getAudioTracks()[0] ?? null;

    this.captureCtx = new AudioContext({ sampleRate: 16000 });
    await this.captureCtx.audioWorklet.addModule(chrome.runtime.getURL("pcm-encoder.js"));

    const merger = this.captureCtx.createChannelMerger(2);
    this.micGain = this.captureCtx.createGain();
    this.captureCtx.createMediaStreamSource(this.micStream).connect(this.micGain);
    this.micGain.connect(merger, 0, 0);
    this.captureCtx.createMediaStreamSource(this.tabStream).connect(merger, 0, 1);

    const worklet = new AudioWorkletNode(this.captureCtx, "pcm-encoder", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    merger.connect(worklet);

    // The worklet only gets pulled if it reaches a destination, but this graph
    // already carries the tab audio that playbackCtx is playing, so route it
    // through a silent sink to avoid doubling it back to the speakers.
    const silentSink = this.captureCtx.createGain();
    silentSink.gain.value = 0;
    worklet.connect(silentSink).connect(this.captureCtx.destination);

    this.ws = new WebSocket(config.wsUrl);
    this.ws.binaryType = "arraybuffer";

    this.ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(String(event.data));
        if (payload.type === "interim" || payload.type === "final" || payload.type === "session_event") {
          config.onTranscript({
            id: crypto.randomUUID(),
            type: payload.type === "session_event" ? "session_event" : payload.type,
            channel: payload.channel ?? 0,
            speaker: payload.speaker ?? "Unknown",
            startMs: payload.start_ms ?? 0,
            endMs: payload.end_ms ?? 0,
            text: payload.text ?? payload.event_kind ?? "",
            confidence: payload.confidence,
          });
        }
      } catch {
        config.onError("Failed to parse transcript event");
      }
    };

    worklet.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
      this.sendQueue.push(event.data);
      this.updateVuFromPcm(event.data);
    };

    this.sendTimer = window.setInterval(() => this.flushSendQueue(), 20);

    const socket = this.ws;
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(
        () => reject(new Error(`Timed out connecting to ${config.wsUrl}`)),
        10_000,
      );
      socket.onopen = () => {
        window.clearTimeout(timeout);
        resolve();
      };
      socket.onerror = () => {
        window.clearTimeout(timeout);
        reject(new Error(`Cannot reach the backend at ${config.wsUrl}`));
      };
    });

    // Only now install the long-lived handler; the one above owns the handshake.
    socket.onerror = () => config.onError("WebSocket error");
    socket.onclose = (event) => {
      if (!event.wasClean) config.onError("Backend connection lost");
    };
  }

  private updateVuFromPcm(buffer: ArrayBuffer): void {
    const view = new Int16Array(buffer);
    let micSum = 0;
    let meetSum = 0;
    const frames = view.length / 2;
    for (let i = 0; i < frames; i += 1) {
      micSum += Math.abs(view[i * 2] ?? 0);
      meetSum += Math.abs(view[i * 2 + 1] ?? 0);
    }
    this.micVu = frames ? micSum / frames / 32768 : 0;
    this.meetingVu = frames ? meetSum / frames / 32768 : 0;
  }

  private flushSendQueue(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const threshold = 256 * 1024;
    while (this.sendQueue.size > 0) {
      if (this.ws.bufferedAmount > threshold) {
        this.sendQueue.shift();
        continue;
      }
      const chunk = this.sendQueue.shift();
      if (chunk) this.ws.send(chunk);
    }
  }

  setExtensionMuted(muted: boolean): void {
    this.extensionMuted = muted;
    this.applyEffectiveMute();
    this.sendControl(muted ? "mic_muted" : "mic_unmuted");
  }

  setMeetMuted(muted: boolean | null): void {
    this.meetMuted = muted;
    this.applyEffectiveMute();
    if (muted === true) this.sendControl("meet_muted");
    if (muted === false) this.sendControl("meet_unmuted");
  }

  sendMeetMuteState(muted: boolean | null): void {
    this.setMeetMuted(muted);
  }

  private sendControl(action: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        action,
        at_ms: Date.now() - this.startedAt,
      }),
    );
  }

  getVu(): { mic: number; meeting: number } {
    return { mic: this.micVu, meeting: this.meetingVu };
  }

  getElapsedMs(): number {
    return Date.now() - this.startedAt;
  }

  async stop(): Promise<void> {
    if (this.sendTimer !== null) {
      clearInterval(this.sendTimer);
      this.sendTimer = null;
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const socket = this.ws;
      this.flushSendQueue();
      socket.send(JSON.stringify({ action: "finalize" }));
      // Give the backend a moment to flush trailing transcripts before closing,
      // otherwise the last words only land in the DB and never reach the panel.
      await new Promise<void>((resolve) => {
        const timeout = window.setTimeout(resolve, 5000);
        socket.onclose = () => {
          window.clearTimeout(timeout);
          resolve();
        };
      });
      if (socket.readyState === WebSocket.OPEN) socket.close();
    }
    this.ws = null;
    this.micStream?.getTracks().forEach((track) => track.stop());
    this.tabStream?.getTracks().forEach((track) => track.stop());
    await this.captureCtx?.close();
    await this.playbackCtx?.close();
    this.captureCtx = null;
    this.playbackCtx = null;
  }
}
