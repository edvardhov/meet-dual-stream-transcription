/** Last stopped backend session — kept so Summarize works after Stop. */
export const LAST_SESSION_KEY = "lastSession";

export interface LastSession {
  sessionId: string;
  tabTitle: string;
  stoppedAt: number;
}

export async function getLastSession(): Promise<LastSession | null> {
  const result = await chrome.storage.local.get(LAST_SESSION_KEY);
  return (result[LAST_SESSION_KEY] as LastSession | undefined) ?? null;
}

export async function setLastSession(session: LastSession): Promise<void> {
  await chrome.storage.local.set({ [LAST_SESSION_KEY]: session });
}

export async function clearLastSession(): Promise<void> {
  await chrome.storage.local.remove(LAST_SESSION_KEY);
}
