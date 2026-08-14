import { describe, expect, it } from "vitest";
import { encodeInterleavedStereo, floatToInt16 } from "./pcm";
import { parseMuteState } from "./muteState";

describe("floatToInt16", () => {
  it("clips and encodes", () => {
    expect(floatToInt16(1.5)).toBe(0x7fff);
    expect(floatToInt16(-1.5)).toBe(-0x8000);
    expect(floatToInt16(0)).toBe(0);
  });
});

describe("encodeInterleavedStereo", () => {
  it("interleaves left then right", () => {
    const left = new Float32Array([1, 0]);
    const right = new Float32Array([0, 1]);
    const out = encodeInterleavedStereo(left, right);
    expect(out.length).toBe(4);
    expect(out[0]).toBe(floatToInt16(1));
    expect(out[1]).toBe(floatToInt16(0));
    expect(out[2]).toBe(floatToInt16(0));
    expect(out[3]).toBe(floatToInt16(1));
  });
});

describe("parseMuteState", () => {
  it("prefers data-is-muted", () => {
    expect(parseMuteState({ dataIsMuted: "true", ariaLabel: "Turn on microphone" })).toBe(true);
    expect(parseMuteState({ dataIsMuted: "false", ariaLabel: "Turn off microphone" })).toBe(false);
  });

  it("handles aria-label unmute substring trap", () => {
    expect(parseMuteState({ ariaLabel: "Turn on microphone (unmute)" })).toBe(true);
    expect(parseMuteState({ ariaLabel: "Turn off microphone (mute)" })).toBe(false);
  });

  it("returns null when undeterminable", () => {
    expect(parseMuteState({})).toBeNull();
    expect(parseMuteState({ ariaLabel: "Camera settings" })).toBeNull();
  });
});
