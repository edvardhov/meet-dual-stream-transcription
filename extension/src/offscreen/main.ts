import { AudioPipeline } from "./audio-pipeline";
import type { RuntimeMessage, Snapshot, TranscriptItem } from "../shared/types";

let pipeline: AudioPipeline | null = null;
let activeSessionId: string | null = null;
const transcript: TranscriptItem[] = [];
let vu = { mic: 0, meeting: 0 };

function broadcast(message: RuntimeMessage): void {
  chrome.runtime.sendMessage(message).catch(() => undefined);
}

function buildSnapshot(): Snapshot {
  return {
    session: null,
    sessionId: activeSessionId,
    capturing: pipeline !== null,
    transcript: [...transcript],
    vu: { ...vu },
    elapsedMs: pipeline?.getElapsedMs() ?? 0,
  };
}

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  if (message.type === "OFFSCREEN_PING") {
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "OFFSCREEN_PROBE_MIC") {
    (async () => {
      try {
        const permission = await navigator.permissions.query({
          name: "microphone" as PermissionName,
        });
        if (permission.state !== "granted") {
          sendResponse({
            ok: false,
            denied: true,
            error: `Microphone permission is "${permission.state}" in the capture context`,
          });
          return;
        }
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
        sendResponse({ ok: true });
      } catch (error) {
        const text = error instanceof Error ? error.message : String(error);
        const denied = error instanceof DOMException && error.name === "NotAllowedError";
        sendResponse({ ok: false, denied, error: text });
      }
    })();
    return true;
  }

  if (message.type === "OFFSCREEN_START") {
    if (pipeline) {
      sendResponse({ ok: false, error: "Capture is already running" });
      return true;
    }
    transcript.length = 0;
    activeSessionId = message.sessionId;
    pipeline = new AudioPipeline();
    pipeline.setInitialMeetMuted(message.initialMeetMuted);
    pipeline
      .start({
        streamId: message.streamId,
        sessionId: message.sessionId,
        wsUrl: message.wsUrl,
        onTranscript: (item) => {
          if (item.type === "interim") {
            const idx = transcript.findIndex(
              (entry) => entry.type === "interim" && entry.channel === item.channel,
            );
            if (idx >= 0) transcript[idx] = item;
            else transcript.push(item);
          } else if (item.type === "final") {
            const interimIdx = transcript.findIndex(
              (entry) => entry.type === "interim" && entry.channel === item.channel,
            );
            if (interimIdx >= 0) transcript.splice(interimIdx, 1);
            transcript.push(item);
          } else {
            transcript.push(item);
          }
          broadcast({ type: "TRANSCRIPT_EVENT", item });
        },
        onVu: (mic, meeting) => {
          vu = { mic, meeting };
        },
        onError: () => broadcast({ type: "CAPTURE_STOPPED" }),
      })
      .then(() => {
        broadcast({ type: "CAPTURE_STARTED", sessionId: message.sessionId });
        sendResponse({ ok: true });
      })
      .catch((error: Error) => {
        activeSessionId = null;
        pipeline = null;
        sendResponse({ ok: false, error: error.message });
      });
    return true;
  }

  if (message.type === "OFFSCREEN_STOP") {
    const stopping = pipeline;
    pipeline = null;
    activeSessionId = null;
    stopping
      ?.stop()
      .finally(() => {
        broadcast({ type: "CAPTURE_STOPPED" });
        sendResponse({ ok: true });
      });
    return true;
  }

  if (message.type === "OFFSCREEN_GET_SNAPSHOT") {
    vu = pipeline?.getVu() ?? vu;
    sendResponse({ type: "SNAPSHOT", snapshot: buildSnapshot() });
    return true;
  }

  if (message.type === "OFFSCREEN_MEET_STATE") {
    pipeline?.sendMeetMuteState(message.muted);
    sendResponse({ ok: true });
    return true;
  }

  return false;
});

setInterval(() => {
  if (!pipeline) return;
  vu = pipeline.getVu();
}, 250);
