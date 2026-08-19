import { describe, expect, it } from "vitest";
import { effectiveMuted, parseMuteState } from "./muteState";

describe("parseMuteState", () => {
  it("reads data-is-muted attribute", () => {
    expect(parseMuteState({ dataIsMuted: "true" })).toBe(true);
    expect(parseMuteState({ dataIsMuted: "false" })).toBe(false);
  });

  it("falls back to aria-label", () => {
    expect(parseMuteState({ ariaLabel: "Unmute microphone" })).toBe(true);
    expect(parseMuteState({ ariaLabel: "Mute microphone" })).toBe(false);
  });

  it("returns null when unknown", () => {
    expect(parseMuteState({})).toBe(null);
    expect(parseMuteState({ ariaLabel: "Settings" })).toBe(null);
  });
});

describe("effectiveMuted", () => {
  it("is true when Meet mic is muted", () => {
    expect(effectiveMuted(true)).toBe(true);
  });

  it("is false when Meet mic is unmuted or unknown", () => {
    expect(effectiveMuted(false)).toBe(false);
    expect(effectiveMuted(null)).toBe(false);
  });
});
