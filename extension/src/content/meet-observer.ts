import { findMuteButton, parseMuteState } from "../shared/muteState";
import { probeMeetInCall } from "../shared/meetCallState";

declare global {
  interface Window {
    __meetTranscriptionObserver?: true;
  }
}

let observer: MutationObserver | null = null;
let bodyObserver: MutationObserver | null = null;
let pollTimer: number | null = null;
let retryTimer: number | null = null;
let debounceTimer: number | null = null;
/** Last payload sent so we do not spam the service worker. */
let lastSent = "";
/** Consecutive polls reporting out-of-call before we emit leave. */
let outOfCallStreak = 0;

const OUT_OF_CALL_EMIT_THRESHOLD = 3;
const POLL_MS = 1000;

function readMuteState(): { muted: boolean | null; buttonFound: boolean } {
  const button = findMuteButton();
  if (!button) return { muted: null, buttonFound: false };
  return {
    muted: parseMuteState({
      dataIsMuted: button.getAttribute("data-is-muted"),
      ariaLabel: button.getAttribute("aria-label"),
    }),
    buttonFound: true,
  };
}

function readPageState(): { inCall: boolean; muted: boolean | null; observerReady: boolean } {
  const call = probeMeetInCall(document, location.pathname);
  const { muted, buttonFound } = readMuteState();
  return {
    inCall: call.inCall,
    muted: buttonFound ? muted : null,
    observerReady: call.definite || buttonFound,
  };
}

function emit(state: ReturnType<typeof readPageState>): void {
  const key = `${state.inCall}:${state.observerReady}:${state.muted}`;
  if (key === lastSent) return;
  lastSent = key;
  chrome.runtime
    .sendMessage({
      type: "MEET_PAGE_STATE",
      inCall: state.inCall,
      muted: state.muted,
      observerReady: state.observerReady,
      tabId: 0,
    })
    .catch(() => undefined);
}

function scheduleEmit(): void {
  if (debounceTimer !== null) window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => {
    publishState(false);
  }, 150);
}

function publishState(force: boolean): void {
  const state = readPageState();

  if (state.inCall) {
    outOfCallStreak = 0;
    emit(state);
    return;
  }

  outOfCallStreak += 1;
  if (force || state.observerReady || outOfCallStreak >= OUT_OF_CALL_EMIT_THRESHOLD) {
    emit(state);
  }
}

function attachMuteObserver(button: HTMLElement): void {
  observer?.disconnect();
  observer = new MutationObserver(scheduleEmit);
  observer.observe(button, {
    attributes: true,
    attributeFilter: ["data-is-muted", "aria-label"],
  });
}

function attachBodyObserver(): void {
  if (!document.body) return;
  bodyObserver?.disconnect();
  bodyObserver = new MutationObserver(scheduleEmit);
  bodyObserver.observe(document.body, { childList: true, subtree: true });
}

function tryConnectMuteObserver(): boolean {
  const button = findMuteButton();
  if (!button) return false;
  attachMuteObserver(button);
  return true;
}

function startObserver(): void {
  stopObserver();
  lastSent = "";
  outOfCallStreak = 0;

  attachBodyObserver();
  tryConnectMuteObserver();
  publishState(true);

  pollTimer = window.setInterval(() => publishState(false), POLL_MS);

  if (tryConnectMuteObserver()) return;

  let attempts = 0;
  retryTimer = window.setInterval(() => {
    attempts += 1;
    if (tryConnectMuteObserver() || attempts >= 60) {
      if (retryTimer !== null) {
        window.clearInterval(retryTimer);
        retryTimer = null;
      }
    }
  }, 500);
}

function stopObserver(): void {
  observer?.disconnect();
  observer = null;
  bodyObserver?.disconnect();
  bodyObserver = null;
  if (pollTimer !== null) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
  if (retryTimer !== null) {
    window.clearInterval(retryTimer);
    retryTimer = null;
  }
  if (debounceTimer !== null) {
    window.clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}

if (!window.__meetTranscriptionObserver) {
  window.__meetTranscriptionObserver = true;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "GET_MEET_PAGE_STATE") {
      const state = readPageState();
      sendResponse({ ok: true, ...state });
      return true;
    }
    return false;
  });

  startObserver();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") startObserver();
    else stopObserver();
  });
  window.addEventListener("pagehide", stopObserver);
}
