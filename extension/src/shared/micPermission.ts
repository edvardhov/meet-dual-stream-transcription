/** Mic grant is persisted because permissions.query lies in popup/side panel. */
export const MIC_GRANTED_KEY = "micGranted";

export async function isMicGranted(): Promise<boolean> {
  const result = await chrome.storage.local.get(MIC_GRANTED_KEY);
  return result[MIC_GRANTED_KEY] === true;
}

export async function setMicGranted(granted: boolean): Promise<void> {
  if (granted) {
    await chrome.storage.local.set({ [MIC_GRANTED_KEY]: true });
  } else {
    await chrome.storage.local.remove(MIC_GRANTED_KEY);
  }
}
