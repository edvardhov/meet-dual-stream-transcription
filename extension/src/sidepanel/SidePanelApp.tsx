import { useEffect, useMemo, useRef, useState } from "react";
import { isMicGranted } from "../shared/micPermission";
import { effectiveMuted } from "../shared/muteState";
import { BACKEND_URL, MEET_URL_PATTERN, type Snapshot, type StoredSession, type TranscriptItem } from "../shared/types";

interface MeetingSummary {
  tldr: string;
  key_points: string[];
  decisions: string[];
  action_items: Array<{ owner: string; task: string; due?: string | null }>;
  open_questions: string[];
  per_speaker_summary: { you: string; others: string };
}

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatClock(ms: number): string {
  const total = Math.floor(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function VuMeter({ label, level }: { label: string; level: number }) {
  const pct = Math.min(100, Math.round(level * 400));
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-fog-300">
        <span>{label}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 rounded bg-haiti-800">
        <div className="h-2 rounded bg-cornflower-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function MicBanner({
  session,
  capturing,
}: {
  session: StoredSession | null;
  capturing: boolean;
}) {
  if (!session && !capturing) return null;

  const muted = effectiveMuted(session?.meetMuted ?? null);
  const meetSynced =
    session?.meetMuteKnown === true || session?.meetMuted !== null;

  if (muted) {
    return (
      <div className="rounded border border-haiti-700 bg-haiti-900 px-3 py-2 text-sm text-fog-200">
        Mic muted in Google Meet — you are not being transcribed
      </div>
    );
  }

  if (meetSynced) {
    return (
      <div className="rounded border border-cornflower-800 bg-cornflower-950 px-3 py-2 text-sm text-fog-100">
        Meet mute is synced — muting in Google Meet stops your transcription.
      </div>
    );
  }

  return null;
}

export function SidePanelApp() {
  const [session, setSession] = useState<StoredSession | null>(null);
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [vu, setVu] = useState({ mic: 0, meeting: 0 });
  const [elapsedMs, setElapsedMs] = useState(0);
  const [tab, setTab] = useState<"transcript" | "summary">("transcript");
  const [summary, setSummary] = useState<MeetingSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [viewMode, setViewMode] = useState<"timeline" | "columns">("timeline");
  const [autoScroll, setAutoScroll] = useState(true);
  const [micGranted, setMicGranted] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [backendSessionId, setBackendSessionId] = useState<string | null>(null);
  const [lastSessionTitle, setLastSessionTitle] = useState<string | null>(null);
  const [onMeetTab, setOnMeetTab] = useState(false);
  const [inMeetCall, setInMeetCall] = useState(false);
  const [meetPageReachable, setMeetPageReachable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void refreshMicGranted();
    void refreshStatus();
    const interval = window.setInterval(() => void refreshStatus(), 1000);
    const storageListener = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area === "session" && changes.activeSession) {
        void refreshStatus();
      }
      if (area === "local" && changes.lastSession) {
        void refreshStatus();
      }
    };
    chrome.storage.onChanged.addListener(storageListener);
    const listener = (message: {
      type?: string;
      item?: TranscriptItem;
      sessionId?: string;
    }) => {
      if (message.type === "MIC_GRANTED") {
        void refreshMicGranted();
        setError(null);
      }
      if (
        message.type === "CAPTURE_STARTED" ||
        message.type === "CAPTURE_STOPPED" ||
        message.type === "SESSION_STATE" ||
        message.type === "SESSION_UPDATED"
      ) {
        if (message.type === "SESSION_UPDATED" && "session" in message) {
          setSession(message.session as StoredSession);
        }
        void refreshStatus();
      }
      if (message.type === "TRANSCRIPT_EVENT" && message.item) {
        setTranscript((prev) => {
          if (message.item!.type === "interim") {
            const idx = prev.findIndex((e) => e.type === "interim" && e.channel === message.item!.channel);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = message.item!;
              return next;
            }
          }
          if (message.item!.type === "final") {
            return [...prev.filter((e) => !(e.type === "interim" && e.channel === message.item!.channel)), message.item!];
          }
          return [...prev, message.item!];
        });
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => {
      clearInterval(interval);
      chrome.storage.onChanged.removeListener(storageListener);
      chrome.runtime.onMessage.removeListener(listener);
    };
  }, []);

  useEffect(() => {
    if (!autoScroll || !scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [transcript, autoScroll]);

  async function refreshMicGranted() {
    setMicGranted(await isMicGranted());
  }

  async function refreshStatus() {
    const response = await chrome.runtime.sendMessage({ type: "GET_STATUS" });
    if (!response?.ok) {
      setError(response?.error ?? "Could not reach the extension background.");
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      setOnMeetTab(Boolean(tab?.url && MEET_URL_PATTERN.test(tab.url)));
      setInMeetCall(false);
      setMeetPageReachable(false);
      return;
    }
    setError(null);
    const active = (response.session as StoredSession | null) ?? null;
    setSession(active);
    const snap = response.snapshot as Snapshot | null;
    const last = response.lastSession as { sessionId: string; tabTitle: string } | null;
    setCapturing(snap?.capturing ?? false);
    setOnMeetTab(response.onMeetTab === true);
    setInMeetCall(response.inMeetCall === true);
    setMeetPageReachable(response.meetPageReachable === true);
    setLastSessionTitle(last?.tabTitle ?? null);
    setBackendSessionId(active?.sessionId ?? snap?.sessionId ?? last?.sessionId ?? null);

    if (snap?.capturing) {
      setTranscript(snap.transcript);
      setVu(snap.vu);
      setElapsedMs(snap.elapsedMs);
    }
  }

  /**
   * Prompting from the side panel itself yields "permission dismissed"; Chrome
   * only reliably shows the prompt on a full extension page.
   */
  async function enableMicrophone() {
    setError(null);
    const tab = await chrome.tabs.create({
      url: chrome.runtime.getURL("src/permission/index.html"),
    });
    const listener = (closedTabId: number) => {
      if (closedTabId !== tab.id) return;
      chrome.tabs.onRemoved.removeListener(listener);
      void refreshMicGranted();
    };
    chrome.tabs.onRemoved.addListener(listener);
  }

  async function startCapture() {
    if (!micGranted) {
      setError("Enable the microphone first, then start capture.");
      return;
    }
    if (!onMeetTab) {
      setError("Switch to your Google Meet tab first. Capture only works on meet.google.com.");
      return;
    }
    if (!inMeetCall) {
      setError("Join the meeting first. Capture only works during an active call — not the lobby or home screen.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!active?.id) throw new Error("No active tab");
      const response = await chrome.runtime.sendMessage({
        type: "START_CAPTURE",
        tabId: active.id,
      });
      if (!response?.ok) throw new Error(response?.error ?? "Failed to start capture");
      setTranscript([]);
      setSummary(null);
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start capture");
    } finally {
      setBusy(false);
    }
  }

  async function stopCapture() {
    setBusy(true);
    setError(null);
    try {
      await chrome.runtime.sendMessage({ type: "STOP_CAPTURE" });
      setCapturing(false);
      await refreshStatus();
    } finally {
      setBusy(false);
    }
  }

  async function summarize() {
    const sessionId = backendSessionId;
    if (!sessionId) {
      setError("No session to summarize. Start capture first.");
      return;
    }
    setSummaryLoading(true);
    setError(null);
    try {
      const response = await fetch(`${BACKEND_URL}/api/sessions/${sessionId}/summarize`, {
        method: "POST",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.detail ?? `Summarize failed (HTTP ${response.status})`);
      }
      setSummary(payload.payload as MeetingSummary);
      setTab("summary");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Summarize failed");
    } finally {
      setSummaryLoading(false);
    }
  }

  const isActive =
    capturing || session?.state === "active" || session?.state === "starting";
  const canSummarize = Boolean(backendSessionId);

  const startButtonLabel = (() => {
    if (busy) return "Starting…";
    if (!onMeetTab) return "Switch to Google Meet to start";
    if (onMeetTab && !meetPageReachable) return "Reload the Meet tab to start";
    if (!inMeetCall) return "Join the meeting to start capture";
    return "Start capture on this Meet tab";
  })();

  const startDisabled =
    busy || !micGranted || !onMeetTab || !meetPageReachable || !inMeetCall;

  const timeline = useMemo(() => {
    return [...transcript].sort((a, b) => a.startMs - b.startMs);
  }, [transcript]);

  const exportMarkdown = () => {
    const lines = timeline.map((item) => {
      if (item.type === "session_event") {
        return `[${formatClock(item.startMs)}] ${item.text}`;
      }
      return `[${formatClock(item.startMs)}] **${item.speaker}:** ${item.text}`;
    });
    void navigator.clipboard.writeText(lines.join("\n"));
  };

  return (
    <main className="flex h-screen flex-col">
      <header className="space-y-3 border-b border-haiti-800 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">Live Transcript</h1>
            <p className="text-xs text-fog-300">
              {isActive
                ? (session?.tabTitle ?? "Recording")
                : lastSessionTitle
                  ? `Ended — ${lastSessionTitle}`
                  : "No active session"}
            </p>
          </div>
          <div className="text-sm font-mono text-fog-200">{formatElapsed(elapsedMs)}</div>
        </div>
        {micGranted ? (
          <div className="rounded border border-cornflower-800 bg-cornflower-950 px-3 py-2 text-sm text-fog-100">
            Microphone enabled for this extension.
          </div>
        ) : (
          <div className="space-y-2 rounded border border-cornflower-800 bg-haiti-900 px-3 py-2 text-sm">
            <p className="text-fog-100">
              Microphone access is required. Chrome only shows the prompt on a full tab — not
              here in the side panel.
            </p>
            <button
              className="w-full rounded bg-cornflower-500 px-3 py-1 font-medium text-white hover:bg-cornflower-400"
              onClick={() => void enableMicrophone()}
            >
              Enable microphone
            </button>
          </div>
        )}

        {!isActive ? (
          <button
            className="w-full rounded bg-cornflower-500 px-3 py-2 text-sm font-medium text-white hover:bg-cornflower-400 disabled:opacity-50"
            disabled={startDisabled}
            onClick={() => void startCapture()}
          >
            {startButtonLabel}
          </button>
        ) : (
          <button
            className="w-full rounded border border-fog-300 bg-haiti-700 px-3 py-2 text-sm font-medium text-white hover:bg-haiti-600 disabled:opacity-50"
            disabled={busy}
            onClick={() => void stopCapture()}
          >
            Stop capture
          </button>
        )}

        {error && (
          <p className="rounded border border-cornflower-400 bg-haiti-900 px-3 py-2 text-sm text-fog-100">
            {error}
          </p>
        )}

        {!isActive && canSummarize && (
          <div className="rounded border border-haiti-700 bg-haiti-900 px-3 py-2 text-sm text-fog-200">
            Capture stopped. Transcript is kept — press Summarize when ready.
          </div>
        )}

        <MicBanner session={session} capturing={capturing} />
        <div className="grid grid-cols-2 gap-3">
          <VuMeter label="You (mic)" level={vu.mic} />
          <VuMeter label="Meeting (tab)" level={vu.meeting} />
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="rounded bg-haiti-800 px-3 py-1 text-sm" onClick={() => setViewMode((v) => (v === "timeline" ? "columns" : "timeline"))}>
            {viewMode === "timeline" ? "Split view" : "Timeline view"}
          </button>
          <button className="rounded bg-haiti-800 px-3 py-1 text-sm" onClick={exportMarkdown}>Copy markdown</button>
          <button className="rounded bg-cornflower-600 px-3 py-1 text-sm text-white hover:bg-cornflower-500 disabled:opacity-50" disabled={!canSummarize || summaryLoading} onClick={() => void summarize()}>
            {summaryLoading ? "Summarizing..." : "Summarize"}
          </button>
        </div>
        <div className="flex gap-2 text-sm">
          <button className={tab === "transcript" ? "text-white" : "text-fog-400"} onClick={() => setTab("transcript")}>Transcript</button>
          <button className={tab === "summary" ? "text-white" : "text-fog-400"} onClick={() => setTab("summary")}>Summary</button>
        </div>
      </header>

      {tab === "transcript" ? (
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-4"
          onScroll={(event) => {
            const el = event.currentTarget;
            const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
            setAutoScroll(atBottom);
          }}
        >
          {timeline.length === 0 && (
            <p className="text-sm text-fog-300">
              {isActive
                ? "Listening… speak, or wait for someone in the call to talk."
                : "No transcript yet. Open a Google Meet tab and press Start capture."}
            </p>
          )}
          {viewMode === "timeline" ? (
            <div className="space-y-3">
              {timeline.map((item) => (
                <article
                  key={item.id}
                  className={`max-w-[85%] rounded px-3 py-2 text-sm ${
                    item.channel === 0 ? "mr-auto bg-cornflower-950" : "ml-auto border border-fog-400/30 bg-haiti-800"
                  } ${item.type === "interim" ? "italic text-fog-300" : ""}`}
                >
                  {item.type === "session_event" ? (
                    <p className="text-xs text-fog-200">[{item.text}]</p>
                  ) : (
                    <>
                      <p className="mb-1 text-xs text-fog-300">{item.speaker} · {formatClock(item.startMs)}</p>
                      <p>{item.text || "…"}</p>
                    </>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {[0, 1].map((channel) => (
                <section key={channel}>
                  <h2 className="mb-2 text-sm font-semibold">{channel === 0 ? "You" : "Meeting"}</h2>
                  <div className="space-y-2">
                    {timeline.filter((item) => item.channel === channel).map((item) => (
                      <p key={item.id} className={`rounded bg-haiti-900 p-2 text-sm ${item.type === "interim" ? "italic text-fog-300" : ""}`}>
                        {item.text}
                      </p>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 text-sm">
          {!summary ? (
            <p className="text-fog-300">Run summarize to generate a meeting summary.</p>
          ) : (
            <div className="space-y-4">
              <section>
                <h2 className="font-semibold">TL;DR</h2>
                <p>{summary.tldr}</p>
              </section>
              <section>
                <h2 className="font-semibold">Key points</h2>
                <ul className="list-disc pl-5">{summary.key_points.map((point) => <li key={point}>{point}</li>)}</ul>
              </section>
              <section>
                <h2 className="font-semibold">Decisions</h2>
                <ul className="list-disc pl-5">{summary.decisions.map((d) => <li key={d}>{d}</li>)}</ul>
              </section>
              <section>
                <h2 className="font-semibold">Action items</h2>
                <ul className="list-disc pl-5">
                  {summary.action_items.map((item) => (
                    <li key={`${item.owner}-${item.task}`}>{item.owner}: {item.task}{item.due ? ` (due ${item.due})` : ""}</li>
                  ))}
                </ul>
              </section>
              <section>
                <h2 className="font-semibold">Open questions</h2>
                <ul className="list-disc pl-5">{summary.open_questions.map((q) => <li key={q}>{q}</li>)}</ul>
              </section>
              <section>
                <h2 className="font-semibold">Per speaker</h2>
                <p><strong>You:</strong> {summary.per_speaker_summary.you}</p>
                <p><strong>Others:</strong> {summary.per_speaker_summary.others}</p>
              </section>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
