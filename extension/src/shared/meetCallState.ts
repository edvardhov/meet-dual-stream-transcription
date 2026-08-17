/** Meet home / scheduler pages — never an active call. */
const LANDING_PATH = /^\/(?:|landing(?:\/.*)?|new(?:\/.*)?|lookup(?:\/.*)?)$/;

export const LEAVE_CALL_SELECTORS = [
  '[role="button"][aria-label*="Leave call" i]',
  '[role="button"][data-tooltip*="Leave call" i]',
  '[role="button"][aria-label*="Leave meeting" i]',
  '[role="button"][data-tooltip*="Leave meeting" i]',
] as const;

export const END_CALL_SELECTORS = [
  '[role="button"][aria-label*="End call" i]',
  '[role="button"][data-tooltip*="End call" i]',
] as const;

export const PREJOIN_SELECTORS = [
  '[role="button"][aria-label*="Join now" i]',
  '[role="button"][aria-label*="Ask to join" i]',
  '[role="button"][aria-label*="Join anyway" i]',
] as const;

export function isMeetLandingPath(pathname: string): boolean {
  return LANDING_PATH.test(pathname);
}

export function isMeetLandingUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "meet.google.com" && isMeetLandingPath(parsed.pathname);
  } catch {
    return false;
  }
}

export interface MeetCallProbe {
  inCall: boolean;
  /** True when the page clearly shows the post-meeting or lobby state. */
  definite: boolean;
}

function queryAny(doc: Document, selectors: readonly string[]): boolean {
  return selectors.some((selector) => doc.querySelector(selector) !== null);
}

function bodyIncludes(doc: Document, snippet: string): boolean {
  return (doc.body?.innerText ?? "").toLowerCase().includes(snippet);
}

/**
 * Returns whether the user is in an active Google Meet call.
 * Conservative for start: unknown pages without leave/end controls → not in call.
 */
export function probeMeetInCall(
  doc: Pick<Document, "querySelector" | "body">,
  pathname: string,
): MeetCallProbe {
  if (isMeetLandingPath(pathname)) {
    return { inCall: false, definite: true };
  }

  if (
    bodyIncludes(doc as Document, "you left the meeting") ||
    bodyIncludes(doc as Document, "return to home screen") ||
    bodyIncludes(doc as Document, "you've left the meeting")
  ) {
    return { inCall: false, definite: true };
  }

  if (queryAny(doc as Document, LEAVE_CALL_SELECTORS) || queryAny(doc as Document, END_CALL_SELECTORS)) {
    return { inCall: true, definite: true };
  }

  if (queryAny(doc as Document, PREJOIN_SELECTORS)) {
    return { inCall: false, definite: true };
  }

  return { inCall: false, definite: false };
}
