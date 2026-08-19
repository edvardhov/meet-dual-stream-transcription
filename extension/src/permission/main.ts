/**
 * Dedicated permission page.
 *
 * Microphone access must be granted to the extension origin before the offscreen
 * document can call getUserMedia. Offscreen documents cannot prompt at all, and
 * both the popup and the side panel are unreliable for this (the popup closes
 * when the prompt takes focus, and the side panel reports "permission
 * dismissed"). A full tab is the only dependable surface.
 *
 * Chrome's "Allow this time" grant is scoped to this tab only and is revoked
 * when it closes — capture needs "Allow while visiting this site".
 */

import { applyBrandCssVars } from "../shared/brand";
import "./styles.css";

applyBrandCssVars();

const statusEl = document.getElementById("status") as HTMLParagraphElement;
const retryEl = document.getElementById("retry") as HTMLButtonElement;

const ONE_TIME_GRANT_MSG =
  'Choose "Allow while visiting this site" in the Chrome prompt — "Allow this time" will not work for capture.';

async function verifyInCaptureContext(): Promise<{ ok: boolean; denied?: boolean; error?: string }> {
  const response = (await chrome.runtime.sendMessage({ type: "VERIFY_MIC" })) as
    | { ok?: boolean; denied?: boolean; error?: string }
    | undefined;
  if (!response) {
    return { ok: false, error: "Could not reach the extension background." };
  }
  return { ok: response.ok === true, denied: response.denied, error: response.error };
}

async function request(): Promise<void> {
  retryEl.hidden = true;
  statusEl.className = "";
  statusEl.textContent = "Requesting microphone access…";

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());

    statusEl.textContent = "Verifying microphone access in the capture context…";
    const verified = await verifyInCaptureContext();
    if (!verified.ok) {
      throw new DOMException(
        verified.error ?? ONE_TIME_GRANT_MSG,
        verified.denied ? "NotAllowedError" : "AbortError",
      );
    }

    statusEl.className = "ok";
    statusEl.textContent =
      "Microphone enabled. Return to your Meet tab and press Start capture.";
    setTimeout(() => window.close(), 2500);
  } catch (error) {
    await chrome.storage.local.remove("micGranted");
    const denied = error instanceof DOMException && error.name === "NotAllowedError";
    statusEl.className = "err";
    statusEl.textContent = denied
      ? `${ONE_TIME_GRANT_MSG} If you already blocked access, open chrome://settings/content/microphone, set this extension to Allow, then click Try again.`
      : `Could not access the microphone: ${String(error)}`;
    retryEl.hidden = false;
  }
}

retryEl.addEventListener("click", () => void request());
void request();
