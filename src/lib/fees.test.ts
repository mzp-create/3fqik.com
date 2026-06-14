import { describe, it, expect } from "vitest";
import { roundHalfAwayFromZero, computeFee } from "./fees";

describe("roundHalfAwayFromZero", () => {
  it("rounds .5 away from zero (positive)", () => {
    expect(roundHalfAwayFromZero(1.5)).toBe(2);
    expect(roundHalfAwayFromZero(2.5)).toBe(3);
    expect(roundHalfAwayFromZero(0.5)).toBe(1);
  });

  it("rounds .5 away from zero (negative)", () => {
    expect(roundHalfAwayFromZero(-1.5)).toBe(-2);
    expect(roundHalfAwayFromZero(-2.5)).toBe(-3);
    expect(roundHalfAwayFromZero(-0.5)).toBe(-1);
  });

  it("never returns -0", () => {
    expect(Object.is(roundHalfAwayFromZero(0), -0)).toBe(false);
    expect(roundHalfAwayFromZero(0)).toBe(0);
  });
});

describe("computeFee with commission=3%, discount=2%", () => {
  const C = 3;
  const D = 2;

  // Spec examples
  it("win +200000 → commission −6000 (3% × 200000)", () => {
    expect(computeFee(200_000, C, D)).toBe(-6_000);
  });

  it("win +4000000 → commission −120000 (3% × 4000000)", () => {
    expect(computeFee(4_000_000, C, D)).toBe(-120_000);
  });

  it("loss −100000 → discount +2000 (2% × 100000)", () => {
    expect(computeFee(-100_000, C, D)).toBe(2_000);
  });

  it("loss −2000000 → discount +40000 (2% × 2000000)", () => {
    expect(computeFee(-2_000_000, C, D)).toBe(40_000);
  });

  it("push 0 → fee 0", () => {
    expect(computeFee(0, C, D)).toBe(0);
  });

  // Rounding cases
  it("win +50 → 3%×50=1.5 → rounds to −2 (half-away)", () => {
    expect(computeFee(50, C, D)).toBe(-2);
  });

  it("win +33333 → 3%×33333=999.99 → rounds to −1000", () => {
    expect(computeFee(33_333, C, D)).toBe(-1_000);
  });

  it("loss −50001 → 2%×50001=1000.02 → rounds to +1000", () => {
    expect(computeFee(-50_001, C, D)).toBe(1_000);
  });

  // Edge: 0% commission
  it("commission 0% on win → fee 0", () => {
    expect(computeFee(200_000, 0, D)).toBe(0);
  });

  // Edge: 0% discount
  it("discount 0% on loss → fee 0", () => {
    expect(computeFee(-100_000, C, 0)).toBe(0);
  });

  // No -0 in output
  it("never returns -0 for zero net", () => {
    const result = computeFee(0, C, D);
    expect(Object.is(result, -0)).toBe(false);
    expect(result).toBe(0);
  });

  it("never returns -0 for 0% commission on win 0-net edge case", () => {
    // 0 net → returns 0, not -0
    const result = computeFee(0, 0, 0);
    expect(Object.is(result, -0)).toBe(false);
  });
});
