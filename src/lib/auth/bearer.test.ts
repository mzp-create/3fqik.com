import { describe, it, expect } from "vitest";
import { bearerMatches } from "./session";

const SECRET = "x".repeat(32); // valid 32-char service token

describe("bearerMatches", () => {
  it("accepts an exact Bearer match", () => {
    expect(bearerMatches(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });
  it("rejects a wrong token", () => {
    expect(bearerMatches(`Bearer ${"y".repeat(32)}`, SECRET)).toBe(false);
  });
  it("rejects a missing or malformed header", () => {
    expect(bearerMatches(null, SECRET)).toBe(false);
    expect(bearerMatches(undefined, SECRET)).toBe(false);
    expect(bearerMatches(SECRET, SECRET)).toBe(false); // no 'Bearer ' prefix
  });
  it("rejects when the secret is unset or too short", () => {
    expect(bearerMatches(`Bearer ${SECRET}`, undefined)).toBe(false);
    expect(bearerMatches("Bearer short", "short")).toBe(false);
  });
  it("rejects a length-mismatched token", () => {
    expect(bearerMatches(`Bearer ${SECRET}extra`, SECRET)).toBe(false);
  });
});
