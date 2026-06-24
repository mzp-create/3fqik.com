import { describe, it, expect } from "vitest";
import { finalScore } from "./format";

describe("finalScore", () => {
  it("returns 'home–away' (en-dash) for a finished match with both scores", () => {
    expect(finalScore("finished", 2, 1)).toBe("2–1");
    expect(finalScore("finished", 0, 0)).toBe("0–0");
  });
  it("returns null when the match is not finished", () => {
    expect(finalScore("live", 1, 0)).toBeNull();
    expect(finalScore("scheduled", null, null)).toBeNull();
    expect(finalScore(undefined, 2, 1)).toBeNull();
  });
  it("returns null when either score is missing on a finished match", () => {
    expect(finalScore("finished", null, 1)).toBeNull();
    expect(finalScore("finished", 2, null)).toBeNull();
    expect(finalScore("finished", undefined, undefined)).toBeNull();
  });
});
