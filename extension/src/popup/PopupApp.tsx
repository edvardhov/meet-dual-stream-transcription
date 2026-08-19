import { useEffect, useState } from "react";
import { isMicGranted } from "../shared/micPermission";
import { MEET_URL_PATTERN, type StoredSession } from "../shared/types";

export function PopupApp() {
  const [micGranted, setMicGranted] = useState(false);
  const [onMeetTab, setOnMeetTab] = useState(false);
  const [inMeetCall, setInMeetCall] = useState(false);
  const [session, setSession] = useState<StoredSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void refresh();
    const listener = (message: { type?: string }) => {
      if (message.type === "MIC_GRANTED") void refresh();
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  async function refresh() {
    setMicGranted(await isMicGranted());
    const status = await chrome.runtime.sendMessage({ type: "GET_STATUS" });
    if (status?.ok) {
      setOnMeetTab(status.onMeetTab === true);
      setInMeetCall(status.inMeetCall === true);
      setSession((status.session as StoredSession | null) ?? null);
      return;
    }
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    setOnMeetTab(Boolean(tab?.url && MEET_URL_PATTERN.test(tab.url)));
    setInMeetCall(false);
    const result = await chrome.storage.session.get("activeSession");
    setSession((result.activeSession as StoredSession | undefined) ?? null);
  }

  async function enableMicrophone() {
    await chrome.tabs.create({ url: chrome.runtime.getURL("src/permission/index.html") });
    window.close();
  }

  async function openSidePanel() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.windowId !== undefined) {
      await chrome.sidePanel.open({ windowId: tab.windowId });
    }
    window.close();
  }

  async function startCapture() {
    if (!micGranted) {
      setError("Enable the microphone first, then start capture.");
      return;
    }
    if (!onMeetTab) {
      setError("Open Google Meet in this tab first. Capture only works on meet.google.com.");
      return;
    }
    if (!inMeetCall) {
      setError("Join the meeting first. Capture only works during an active call.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error("No active tab");
      const response = await chrome.runtime.sendMessage({ type: "START_CAPTURE", tabId: tab.id });
      if (!response?.ok) throw new Error(response?.error ?? "Failed to start");
      setSession(response.session ?? null);
      await openSidePanel();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start capture");
    } finally {
      setBusy(false);
    }
  }

  async function stopCapture() {
    setBusy(true);
    await chrome.runtime.sendMessage({ type: "STOP_CAPTURE" });
    await refresh();
    setBusy(false);
  }

  const isActive = session?.state === "active";

  return (
    <main className="w-80 space-y-4 p-4">
      <header>
        <h1 className="text-lg font-semibold">Meet Transcription</h1>
        <p className="text-sm text-fog-300">Dual-stream live transcription and summary.</p>
      </header>

      <section className="rounded-lg border border-haiti-800 bg-haiti-900 p-3 text-sm">
        {micGranted ? (
          <p className="text-fog-100">Microphone enabled for this extension.</p>
        ) : (
          <>
            <p>Microphone permission is required before capture can start.</p>
            <p className="mt-1 text-xs text-fog-300">
              Chrome only shows the prompt on a full tab, so this opens one.
            </p>
            <button
              className="mt-2 w-full rounded bg-cornflower-500 px-3 py-2 font-medium text-white hover:bg-cornflower-400"
              onClick={() => void enableMicrophone()}
            >
              Enable microphone
            </button>
          </>
        )}
      </section>

      <section className="space-y-2">
        {!isActive ? (
          <button
            className="w-full rounded bg-cornflower-500 px-3 py-2 font-medium text-white hover:bg-cornflower-400 disabled:opacity-50"
            disabled={busy || !micGranted || !onMeetTab || !inMeetCall}
            onClick={() => void startCapture()}
          >
            {busy
              ? "Starting…"
              : !onMeetTab
                ? "Open Google Meet to start"
                : !inMeetCall
                  ? "Join the meeting to start"
                  : "Start capture on this Meet tab"}
          </button>
        ) : (
          <button
            className="w-full rounded border border-fog-300 bg-haiti-700 px-3 py-2 font-medium text-white hover:bg-haiti-600 disabled:opacity-50"
            disabled={busy}
            onClick={() => void stopCapture()}
          >
            Stop capture
          </button>
        )}
        <button
          className="w-full rounded bg-haiti-800 px-3 py-2 text-sm hover:bg-haiti-700"
          onClick={() => void openSidePanel()}
        >
          Open side panel
        </button>
      </section>

      {isActive && (
        <p className="text-xs text-fog-200">
          Meet&apos;s mute button stops your transcription when sync is active.
        </p>
      )}

      {error && <p className="text-sm text-fog-200">{error}</p>}
    </main>
  );
}
