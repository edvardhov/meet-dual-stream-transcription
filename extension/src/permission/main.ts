/**
 * Dedicated permission page.
 *
 * Microphone access must be granted to the extension origin before the offscreen
 * document can call getUserMedia. Offscreen documents cannot prompt at all, and
 * both the popup and the side panel are unreliable for this (the popup closes
 * when the prompt takes focus, and the side panel reports "permission
 * dismissed"). A full tab is the only dependable surface.
 */

const statusEl = document.getElementById("status") as HTMLParagraphElement;
const retryEl = document.getElementById("retry") as HTMLButtonElement;

async function confirmGranted(): Promise<boolean> {
  try {
    const permission = await navigator.permissions.query({
      name: "microphone" as PermissionName,
    });
    return permission.state === "granted";
  } catch {
    return false;
  }
}

async function request(): Promise<void> {
  retryEl.hidden = true;
  statusEl.className = "";
  statusEl.textContent = "Requesting microphone access…";

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());

    if (!(await confirmGranted())) {
      throw new DOMException("Microphone permission did not stick", "NotAllowedError");
    }

    await chrome.runtime.sendMessage({ type: "MIC_GRANTED" });

    statusEl.className = "ok";
    statusEl.textContent =
      "Microphone enabled. Return to your Meet tab and press Start capture.";
    setTimeout(() => window.close(), 2500);
  } catch (error) {
    await chrome.storage.local.remove("micGranted");
    const denied = error instanceof DOMException && error.name === "NotAllowedError";
    statusEl.className = "err";
    statusEl.textContent = denied
      ? "Permission was blocked or dismissed. Open chrome://settings/content/microphone, set this extension to Allow, then click Try again."
      : `Could not access the microphone: ${String(error)}`;
    retryEl.hidden = false;
  }
}

retryEl.addEventListener("click", () => void request());
void request();
