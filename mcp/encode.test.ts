import { describe, it, expect } from "vitest";
import { encodeBall, encodePrice, lineWire } from "./encode";

describe("encodeBall", () => {
  it("converts goals to ballQ ×4", () => {
    expect(encodeBall(0.75, "ah")).toBe(3);
    expect(encodeBall(1, "ah")).toBe(4);
    expect(encodeBall(2.5, "ou")).toBe(10);
    expect(encodeBall(0, "ah")).toBe(0);
  });
  it("rejects off-grid lines", () => {
    expect(() => encodeBall(0.3, "ah")).toThrow(/multiple of 0.25/);
  });
  it("rejects out-of-range and O/U 0.0", () => {
    expect(() => encodeBall(11, "ah")).toThrow();
    expect(() => encodeBall(0, "ou")).toThrow();
  });
});

describe("encodePrice", () => {
  it("converts Malay price to signed ×100", () => {
    expect(encodePrice(0.92)).toBe(92);
    expect(encodePrice(-0.98)).toBe(-98);
    expect(encodePrice(0.05)).toBe(5);
  });
  it("rejects 0, out-of-range, and off-grid", () => {
    expect(() => encodePrice(0)).toThrow(/cannot be 0/);
    expect(() => encodePrice(1.5)).toThrow(/between/);
    expect(() => encodePrice(0.123)).toThrow(/multiple of 0.01/);
  });
});

describe("lineWire", () => {
  it("encodes and mirrors the opposite side by default", () => {
    const w = lineWire({
      matchId: 33,
      market: "ah",
      favSide: "home",
      handicapGoals: 1,
      priceMalay: 0.45,
    });
    expect(w).toEqual({
      matchId: 33,
      market: "ah",
      favSide: "home",
      ballQ: 4,
      priceC: 45,
      priceOppC: -45,
    });
  });
  it("honors an explicit opposite price", () => {
    const w = lineWire({
      matchId: 5,
      market: "ou",
      handicapGoals: 2.5,
      priceMalay: -0.7,
      priceOppMalay: 0.62,
    });
    expect(w.market).toBe("ou");
    expect(w.favSide).toBe("home"); // dummy for O/U
    expect(w.ballQ).toBe(10);
    expect(w.priceC).toBe(-70);
    expect(w.priceOppC).toBe(62);
  });
  it("requires favSide for AH", () => {
    expect(() =>
      lineWire({ matchId: 1, market: "ah", handicapGoals: 1, priceMalay: 0.9 }),
    ).toThrow(/favSide/);
  });
});
