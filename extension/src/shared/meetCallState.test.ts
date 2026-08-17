import { describe, expect, it } from "vitest";
import { isMeetLandingPath, isMeetLandingUrl, probeMeetInCall } from "./meetCallState";

function fakeDoc(html: string, text = ""): Document {
  return {
    querySelector: (sel: string) => {
      if (html.includes(sel.replace(/\[|\]|"/g, ""))) return {};
      return null;
    },
    body: { innerText: text },
  } as unknown as Document;
}

describe("isMeetLandingPath", () => {
  it("treats home and landing as not in call", () => {
    expect(isMeetLandingPath("/")).toBe(true);
    expect(isMeetLandingPath("/landing")).toBe(true);
    expect(isMeetLandingPath("/new")).toBe(true);
  });

  it("treats meeting codes as call-capable URLs", () => {
    expect(isMeetLandingPath("/abc-defg-hij")).toBe(false);
  });
});

describe("isMeetLandingUrl", () => {
  it("parses meet URLs", () => {
    expect(isMeetLandingUrl("https://meet.google.com/")).toBe(true);
    expect(isMeetLandingUrl("https://meet.google.com/xyz-abcd-efg")).toBe(false);
  });
});

describe("probeMeetInCall", () => {
  it("detects active call via leave button", () => {
    const doc = {
      querySelector: (sel: string) =>
        sel.includes("Leave call") ? ({}) : null,
      body: { innerText: "" },
    } as unknown as Document;
    expect(probeMeetInCall(doc, "/abc-defg-hij")).toEqual({ inCall: true, definite: true });
  });

  it("detects lobby via join button", () => {
    const doc = {
      querySelector: (sel: string) =>
        sel.includes("Join now") ? ({}) : null,
      body: { innerText: "Get ready" },
    } as unknown as Document;
    expect(probeMeetInCall(doc, "/abc-defg-hij")).toEqual({ inCall: false, definite: true });
  });

  it("detects post-meeting screen", () => {
    const doc = fakeDoc("", "You left the meeting");
    expect(probeMeetInCall(doc, "/abc-defg-hij")).toEqual({ inCall: false, definite: true });
  });
});
