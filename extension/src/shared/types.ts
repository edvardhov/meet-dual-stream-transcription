export const BACKEND_URL = "http://localhost:8000";

export type SessionState =
  | "idle"
  | "priming"
  | "starting"
  | "active"
  | "stopping"
  | "error";

export interface StoredSession {
  sessionId: string;
  tabId: number;
  tabTitle: string;
  state: SessionState;
  startedAt: number;
  meetMuted: boolean | null;
  meetMuteKnown: boolean;
  error?: string;
}

export interface TranscriptItem {
  id: string;
  type: "interim" | "final" | "muted_span" | "session_event";
  channel: number;
  speaker: string;
  startMs: number;
  endMs: number;
  text: string;
  confidence?: number | null;
}

export interface Snapshot {
  session: StoredSession | null;
  sessionId: string | null;
  capturing: boolean;
  transcript: TranscriptItem[];
  vu: { mic: number; meeting: number };
  elapsedMs: number;
}

export type RuntimeMessage =
  | { type: "START_CAPTURE"; tabId: number }
  | { type: "STOP_CAPTURE" }
  | { type: "GET_SNAPSHOT" }
  | { type: "GET_STATUS" }
  | { type: "MEET_PAGE_STATE"; inCall: boolean; muted: boolean | null; tabId: number; observerReady?: boolean }
  | { type: "SESSION_UPDATED"; session: StoredSession }
  | {
      type: "OFFSCREEN_START";
      sessionId: string;
      streamId: string;
      wsUrl: string;
      initialMeetMuted: boolean | null;
    }
  | { type: "OFFSCREEN_STOP" }
  | { type: "OFFSCREEN_MEET_STATE"; inCall: boolean; muted: boolean | null; tabId: number; observerReady?: boolean }
  | { type: "OFFSCREEN_GET_SNAPSHOT" }
  | { type: "OFFSCREEN_PROBE_MIC" }
  | { type: "SNAPSHOT"; snapshot: Snapshot }
  | { type: "TRANSCRIPT_EVENT"; item: TranscriptItem }
  | { type: "CAPTURE_STARTED"; sessionId: string }
  | { type: "CAPTURE_STOPPED" }
  | { type: "SESSION_STATE"; session: StoredSession | null }
  | { type: "OPEN_SIDE_PANEL" }
  | { type: "MIC_GRANTED" }
  | { type: "GET_MIC_STATUS" };

export const MEET_URL_PATTERN = /^https:\/\/meet\.google\.com\//;
