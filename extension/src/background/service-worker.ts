import { badge } from "../shared/brand";
import { clearLastSession, getLastSession, setLastSession } from "../shared/lastSession";
import { isMeetLandingUrl } from "../shared/meetCallState";
import { effectiveMuted } from "../shared/muteState";
import { isMicGranted, setMicGranted } from "../shared/micPermission";
import { BACKEND_URL, MEET_URL_PATTERN, type RuntimeMessage, type StoredSession } from "../shared/types";

const SESSION_KEY = "activeSession";

const MIC_NOT_READY =
  "Microphone is not granted to the extension. Click Enable microphone, choose Allow while visiting this site in the tab that opens, then try again.";

const OFFSCREEN_READY_TIMEOUT_MS = 2000;
const OFFSCREEN_READY_POLL_MS = 50;
const REINJECT_COOLDOWN_MS = 5000;

/** Per-tab timestamp of last content-script re-injection attempt. */
const reinjectCooldown = new Map<number, number>();

/** Service workers have no `window`; timers must use the global scope. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getSession(): Promise<StoredSession | null> {
  const result = await chrome.storage.session.get(SESSION_KEY);
  return (result[SESSION_KEY] as StoredSession | undefined) ?? null;
}

async function setSession(session: StoredSession | null): Promise<void> {
  if (session) await chrome.storage.session.set({ [SESSION_KEY]: session });
  else await chrome.storage.session.remove(SESSION_KEY);
  await updateBadge(session);
}

async function updateBadge(session: StoredSession | null): Promise<void> {
  if (!session || session.state !== "active") {
    await chrome.action.setBadgeText({ text: "" });
    return;
  }
  const effective = effectiveMuted(session.meetMuted);
  await chrome.action.setBadgeText({ text: effective ? "MUTE" : "REC" });
  await chrome.action.setBadgeBackgroundColor({
    color: effective ? badge.muted : badge.recording,
  });
}

async function hasOffscreen(): Promise<boolean> {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  });
  return contexts.length > 0;
}

async function closeOffscreen(): Promise<void> {
  if (await hasOffscreen()) {
    await chrome.offscreen.closeDocument();
  }
}

async function ensureOffscreen(): Promise<void> {
  if (await hasOffscreen()) return;
  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: [chrome.offscreen.Reason.USER_MEDIA],
    justification: "Capture microphone and tab audio for transcription",
  });
}

/**
 * `createDocument` resolves before the offscreen module registers its message
 * listener, so messages sent immediately after are dropped. Poll until it
 * answers a ping.
 */
async function waitForOffscreenReady(): Promise<boolean> {
  const deadline = Date.now() + OFFSCREEN_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const response = (await chrome.runtime.sendMessage({ type: "OFFSCREEN_PING" })) as
        | { ok?: boolean }
        | undefined;
      if (response?.ok) return true;
    } catch {
      // Listener not installed yet.
    }
    await delay(OFFSCREEN_READY_POLL_MS);
  }
  return false;
}

/** A fresh offscreen document picks up mic grants made on the permission page. */
async function resetOffscreen(): Promise<boolean> {
  await closeOffscreen();
  await ensureOffscreen();
  return waitForOffscreenReady();
}

async function sendToOffscreen<T>(message: RuntimeMessage): Promise<T | null> {
  if (!(await hasOffscreen())) return null;
  try {
    return (await chrome.runtime.sendMessage(message)) as T;
  } catch {
    return null;
  }
}

async function probeMicInOffscreen(): Promise<{ ok: boolean; denied?: boolean; error?: string }> {
  const status = await sendToOffscreen<{ snapshot?: { capturing?: boolean } }>({
    type: "OFFSCREEN_GET_SNAPSHOT",
  });
  if (status?.snapshot?.capturing) {
    return { ok: true };
  }
  if (!(await resetOffscreen())) {
    return {
      ok: false,
      error: "The capture context did not start in time. Try Start capture again.",
    };
  }
  const response = await sendToOffscreen<{ ok?: boolean; denied?: boolean; error?: string }>({
    type: "OFFSCREEN_PROBE_MIC",
  });
  if (!response) return { ok: false, error: MIC_NOT_READY };
  return { ok: response.ok === true, denied: response.denied === true, error: response.error };
}

interface StatusPayload {
  ok: true;
  session: StoredSession | null;
  lastSession: Awaited<ReturnType<typeof getLastSession>>;
  onMeetTab: boolean;
  inMeetCall: boolean;
  meetPageReachable: boolean;
  snapshot: {
    sessionId: string | null;
    capturing: boolean;
    transcript: unknown[];
    vu: { mic: number; meeting: number };
    elapsedMs: number;
  } | null;
}

interface ActiveMeetTabState {
  onMeetTab: boolean;
  inMeetCall: boolean;
  meetPageReachable: boolean;
}

function getMeetObserverScriptFiles(): string[] {
  const entry = chrome.runtime.getManifest().content_scripts?.find((cs) =>
    cs.matches?.some((pattern) => pattern.includes("meet.google.com")),
  );
  const files = entry?.js;
  if (!files?.length) {
    throw new Error("Meet observer content script not found in manifest");
  }
  return files;
}

async function injectMeetObserver(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: getMeetObserverScriptFiles(),
  });
}

async function reinjectMeetObserverIntoOpenTabs(): Promise<void> {
  const tabs = await chrome.tabs.query({ url: "https://meet.google.com/*" });
  for (const tab of tabs) {
    if (tab.id !== undefined) {
      await injectMeetObserver(tab.id).catch(() => undefined);
    }
  }
}

async function buildStatus(): Promise<StatusPayload> {
  const offscreen = await sendToOffscreen<{ snapshot?: StatusPayload["snapshot"] }>({
    type: "OFFSCREEN_GET_SNAPSHOT",
  });
  const snap = offscreen?.snapshot ?? null;
  let session = await getSession();
  const lastSession = await getLastSession();

  if (snap?.capturing && snap.sessionId) {
    if (!session || session.sessionId !== snap.sessionId || session.state !== "active") {
      session = {
        sessionId: snap.sessionId,
        tabId: session?.tabId ?? 0,
        tabTitle: session?.tabTitle ?? "Google Meet",
        state: "active",
        startedAt: session?.startedAt ?? Date.now(),
        meetMuted: session?.meetMuted ?? null,
        meetMuteKnown: session?.meetMuteKnown ?? false,
      };
      await setSession(session);
    }
  } else if (session?.state === "active") {
    await setSession(null);
    session = null;
  }

  let meetTabState: ActiveMeetTabState = {
    onMeetTab: false,
    inMeetCall: false,
    meetPageReachable: false,
  };
  try {
    meetTabState = await getActiveMeetTabState();
  } catch {
    // Meet probe must not break GET_STATUS.
  }

  return {
    ok: true,
    session,
    lastSession,
    ...meetTabState,
    snapshot: snap,
  };
}

async function queryMeetPageState(
  tabId: number,
): Promise<{ inCall: boolean; muted: boolean | null; observerReady: boolean } | null> {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: "GET_MEET_PAGE_STATE" });
    if (response?.ok) {
      return {
        inCall: response.inCall === true,
        muted: response.muted ?? null,
        observerReady: response.observerReady === true,
      };
    }
  } catch {
    const lastAttempt = reinjectCooldown.get(tabId) ?? 0;
    if (Date.now() - lastAttempt >= REINJECT_COOLDOWN_MS) {
      reinjectCooldown.set(tabId, Date.now());
      await injectMeetObserver(tabId).catch(() => undefined);
      await delay(600);
    }
    try {
      const response = await chrome.tabs.sendMessage(tabId, { type: "GET_MEET_PAGE_STATE" });
      if (response?.ok) {
        return {
          inCall: response.inCall === true,
          muted: response.muted ?? null,
          observerReady: response.observerReady === true,
        };
      }
    } catch {
      return null;
    }
  }
  return null;
}

async function getActiveMeetTabState(): Promise<ActiveMeetTabState> {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!active?.id || !active.url || !MEET_URL_PATTERN.test(active.url)) {
    return { onMeetTab: false, inMeetCall: false, meetPageReachable: false };
  }
  if (isMeetLandingUrl(active.url)) {
    return { onMeetTab: true, inMeetCall: false, meetPageReachable: false };
  }
  const state = await queryMeetPageState(active.id);
  if (state) {
    return { onMeetTab: true, inMeetCall: state.inCall, meetPageReachable: true };
  }
  return { onMeetTab: true, inMeetCall: false, meetPageReachable: false };
}

async function assertTabInMeetCall(
  tabId: number,
): Promise<{ inCall: boolean; muted: boolean | null; observerReady: boolean }> {
  const tab = await chrome.tabs.get(tabId);
  if (!tab.url || !MEET_URL_PATTERN.test(tab.url)) {
    throw new Error(
      "Switch to your Google Meet tab first. Capture only works while meet.google.com is the active tab.",
    );
  }
  if (isMeetLandingUrl(tab.url)) {
    throw new Error("Open or join a meeting first. Capture does not work on the Meet home page.");
  }
  const state = await queryMeetPageState(tabId);
  if (!state?.inCall) {
    throw new Error(
      "Join the Google Meet call first. Capture only works during an active meeting — not the lobby or home screen.",
    );
  }
  return state;
}

async function createBackendSession(tabTitle: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${BACKEND_URL}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tab_title: tabTitle }),
    });
  } catch {
    throw new Error(`Cannot reach the backend at ${BACKEND_URL}. Is docker compose up?`);
  }
  if (!response.ok) {
    throw new Error(`Backend rejected session create (HTTP ${response.status})`);
  }
  const payload = await response.json();
  return payload.id as string;
}

async function getTabStreamId(tabId: number): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (id) => {
      const message = chrome.runtime.lastError?.message;
      if (message || !id) {
        reject(
          new Error(
            message?.includes("invoked")
              ? "Chrome has not granted tab access. Click the extension's toolbar icon on the Meet tab, then start again."
              : (message ?? "Failed to get a tab audio stream ID"),
          ),
        );
        return;
      }
      resolve(id);
    });
  });
}

async function resolveMeetTabId(hintTabId?: number): Promise<number> {
  /** Capture only starts from the tab the user is actually viewing. */
  const candidates: number[] = [];
  if (hintTabId !== undefined) candidates.push(hintTabId);

  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (active?.id !== undefined && !candidates.includes(active.id)) {
    candidates.push(active.id);
  }

  for (const tabId of candidates) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.url && MEET_URL_PATTERN.test(tab.url)) return tabId;
  }

  throw new Error(
    "Switch to your Google Meet tab first. Capture only works while meet.google.com is the active tab.",
  );
}

async function startCapture(tabId: number): Promise<void> {
  const resolvedTabId = await resolveMeetTabId(tabId);
  const meetState = await assertTabInMeetCall(resolvedTabId);
  const tab = await chrome.tabs.get(resolvedTabId);

  const existing = await getSession();
  const live = await buildStatus();
  if (live.snapshot?.capturing || existing?.state === "active") {
    throw new Error("Capture is already running. Press Stop capture first.");
  }

  const tabTitle = tab.title ?? "Google Meet";
  const meetMuted = meetState.muted;
  const meetMuteKnown = meetState.observerReady || meetState.muted !== null;

  await setSession({
    sessionId: "",
    tabId: resolvedTabId,
    tabTitle,
    state: "starting",
    startedAt: Date.now(),
    meetMuted,
    meetMuteKnown,
  });

  try {
    const micProbe = await probeMicInOffscreen();
    if (!micProbe.ok) {
      if (micProbe.denied) await setMicGranted(false);
      throw new Error(micProbe.error ?? MIC_NOT_READY);
    }
    await setMicGranted(true);

    const sessionId = await createBackendSession(tabTitle);
    await setSession({
      sessionId,
      tabId: resolvedTabId,
      tabTitle,
      state: "starting",
      startedAt: Date.now(),
      meetMuted,
      meetMuteKnown,
    });

    const streamId = await getTabStreamId(resolvedTabId);
    const wsUrl = `${BACKEND_URL.replace("http", "ws")}/api/sessions/${sessionId}/stream`;

    const response = await sendToOffscreen<{ ok?: boolean; error?: string }>({
      type: "OFFSCREEN_START",
      sessionId,
      streamId,
      wsUrl,
      initialMeetMuted: meetMuted,
    });

    if (!response?.ok) throw new Error(response?.error ?? "Failed to start offscreen capture");

    await clearLastSession();
    await setSession({
      sessionId,
      tabId: resolvedTabId,
      tabTitle,
      state: "active",
      startedAt: Date.now(),
      meetMuted,
      meetMuteKnown,
    });
  } catch (error) {
    await sendToOffscreen({ type: "OFFSCREEN_STOP" });
    await setSession(null);
    throw error;
  }
}

async function stopCapture(): Promise<void> {
  const session = await getSession();
  const status = await buildStatus();
  const sessionId =
    session?.sessionId ?? status.snapshot?.sessionId ?? status.lastSession?.sessionId;

  if (session) {
    await setSession({ ...session, state: "stopping" });
  }
  await sendToOffscreen({ type: "OFFSCREEN_STOP" });

  if (sessionId) {
    await setLastSession({
      sessionId,
      tabTitle: session?.tabTitle ?? status.lastSession?.tabTitle ?? "Google Meet",
      stoppedAt: Date.now(),
    });
    await fetch(`${BACKEND_URL}/api/sessions/${sessionId}/stop`, {
      method: "POST",
    }).catch(() => undefined);
  }
  await setSession(null);
}

chrome.runtime.onMessage.addListener((message: RuntimeMessage, sender, sendResponse) => {
  (async () => {
    if (message.type === "START_CAPTURE") {
      await startCapture(message.tabId);
      sendResponse({ ok: true, session: await getSession() });
      return;
    }
    if (message.type === "STOP_CAPTURE") {
      await stopCapture();
      sendResponse({ ok: true });
      return;
    }
    if (message.type === "MIC_GRANTED") {
      await setMicGranted(true);
      await closeOffscreen();
      sendResponse({ ok: true, micGranted: true });
      chrome.runtime.sendMessage({ type: "MIC_GRANTED" }).catch(() => undefined);
      return;
    }
    if (message.type === "GET_MIC_STATUS") {
      const granted = await isMicGranted();
      sendResponse({ ok: true, micGranted: granted });
      return;
    }
    if (message.type === "VERIFY_MIC") {
      const probe = await probeMicInOffscreen();
      if (probe.ok) {
        await setMicGranted(true);
        await closeOffscreen();
        chrome.runtime.sendMessage({ type: "MIC_GRANTED" }).catch(() => undefined);
        sendResponse({ ok: true, micGranted: true });
      } else {
        if (probe.denied) await setMicGranted(false);
        sendResponse({ ok: false, denied: probe.denied === true, error: probe.error });
      }
      return;
    }
    if (message.type === "MEET_PAGE_STATE") {
      const session = await getSession();
      const tabId = sender.tab?.id;

      if (session && tabId === session.tabId) {
        const muteChanged = message.muted !== session.meetMuted;

        if (muteChanged) {
          const next = {
            ...session,
            meetMuted: message.muted,
            meetMuteKnown: message.observerReady === true || message.muted !== null,
          };
          await setSession(next);
          await sendToOffscreen({
            type: "OFFSCREEN_MEET_STATE",
            inCall: message.inCall,
            muted: message.muted,
            observerReady: message.observerReady,
            tabId: tabId ?? 0,
          });
          chrome.runtime.sendMessage({ type: "SESSION_UPDATED", session: next }).catch(() => undefined);
        }

        if (message.inCall === false && session.state === "active") {
          await stopCapture();
          chrome.runtime.sendMessage({ type: "CAPTURE_STOPPED" }).catch(() => undefined);
        }
      }

      sendResponse({ ok: true, session: await getSession() });
      return;
    }
    if (message.type === "OPEN_SIDE_PANEL") {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.windowId) await chrome.sidePanel.open({ windowId: tab.windowId });
      sendResponse({ ok: true });
      return;
    }
    if (message.type === "GET_STATUS") {
      sendResponse(await buildStatus());
      return;
    }
    if (message.type === "CAPTURE_STARTED") {
      let current = await getSession();
      if (!current || current.sessionId !== message.sessionId) {
        current = {
          sessionId: message.sessionId,
          tabId: current?.tabId ?? 0,
          tabTitle: current?.tabTitle ?? "Google Meet",
          state: "active",
          startedAt: current?.startedAt ?? Date.now(),
          meetMuted: current?.meetMuted ?? null,
          meetMuteKnown: current?.meetMuteKnown ?? false,
        };
      } else {
        current = { ...current, state: "active" };
      }
      await setSession(current);
      chrome.runtime.sendMessage(message).catch(() => undefined);
      sendResponse({ ok: true });
      return;
    }
    if (message.type === "CAPTURE_STOPPED") {
      await setSession(null);
      chrome.runtime.sendMessage(message).catch(() => undefined);
      sendResponse({ ok: true });
      return;
    }
    if (message.type === "GET_SNAPSHOT") {
      const status = await buildStatus();
      sendResponse({ type: "SNAPSHOT", snapshot: status.snapshot, session: status.session });
      return;
    }
  })().catch((error: Error) => sendResponse({ ok: false, error: error.message }));
  return true;
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const session = await getSession();
  if (session?.tabId === tabId) await stopCapture();
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  const session = await getSession();
  if (!session || session.tabId !== tabId) return;
  const url = changeInfo.url;
  if (url && (!MEET_URL_PATTERN.test(url) || isMeetLandingUrl(url))) {
    await stopCapture();
    chrome.runtime.sendMessage({ type: "CAPTURE_STOPPED" }).catch(() => undefined);
  }
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => undefined);
  void reinjectMeetObserverIntoOpenTabs();
});
