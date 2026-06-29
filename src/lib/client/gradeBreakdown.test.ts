import { it, expect } from "vitest";
import { gradeBreakdown } from "./gradeBreakdown";

const base = {
  favSide: "home" as const,
  homeTeam: "Brazil",
  awayTeam: "Mexico",
  scoreHomeAtBet: 0,
  scoreAwayAtBet: 0,
};

it("negative-price win shows S ÷ |p|, not full stake", () => {
  const b = gradeBreakdown({
    ...base,
    market: "ah",
    side: "fav",
    ballQ: 4,
    priceC: -90,
    stakeMmk: 100_000,
    finalHome: 2,
    finalAway: 0,
  })!;
  expect(b.result).toBe("win");
  expect(b.net).toBe(111_111);
  expect(b.resultLine).toContain("÷");
});

it("quarter half-win renders as half-win", () => {
  const b = gradeBreakdown({
    ...base,
    market: "ah",
    side: "fav",
    ballQ: 3,
    priceC: 92,
    stakeMmk: 100_000,
    finalHome: 1,
    finalAway: 0,
  })!;
  expect(b.result).toBe("half-win");
  expect(b.net).toBe(46_000);
  expect(b.resultLine.toUpperCase()).toContain("HALF");
});

it("quarter half-loss renders as half-loss", () => {
  const b = gradeBreakdown({
    ...base,
    market: "ah",
    side: "fav",
    ballQ: 1,
    priceC: 92,
    stakeMmk: 100_000,
    finalHome: 0,
    finalAway: 0,
  })!;
  expect(b.result).toBe("half-lose");
  expect(b.net).toBe(-50_000);
});
