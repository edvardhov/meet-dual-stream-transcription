export const MUTE_BUTTON_SELECTORS = [
  '[role="button"][data-is-muted][aria-label*="microphone" i]',
  '[role="button"][data-is-muted][aria-label*="mic" i]',
  '[role="button"][data-is-muted][data-tooltip*="microphone" i]',
  '[role="button"][data-is-muted]',
] as const;

export interface MuteStateInput {
  dataIsMuted?: string | null;
  ariaLabel?: string | null;
}

export function parseMuteState(input: MuteStateInput): boolean | null {
  const { dataIsMuted, ariaLabel } = input;
  if (dataIsMuted === "true") return true;
  if (dataIsMuted === "false") return false;
  if (!ariaLabel) return null;

  const label = ariaLabel.toLowerCase();
  if (label.includes("unmute")) return true;
  if (label.includes("mute")) return false;
  return null;
}

export function findMuteButton(): HTMLElement | null {
  for (const selector of MUTE_BUTTON_SELECTORS) {
    const el = document.querySelector<HTMLElement>(selector);
    if (el) return el;
  }
  return null;
}
