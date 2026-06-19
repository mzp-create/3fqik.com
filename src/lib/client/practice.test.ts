import { it, expect } from "vitest";
import {
  resolveDemo,
  applyResult,
  START_BALANCE,
  type DemoBet,
} from "./practice";

const favBet = {
  market: "ah",
  side: "fav",
  favSide: "home",
  ballQ: 3,
  priceC: 92,
  stakeMmk: 100_000,
} as Pick<
  DemoBet,
  "market" | "side" | "favSide" | "ballQ" | "priceC" | "stakeMmk"
>;

it("resolveDemo grades a demo bet via the real engine (home fav wins 2-1)", () => {
  const r = resolveDemo(favBet, 2, 1);
  expect(r.status).toBe("won");
  expect(r.netMmk).toBe(92_000);
});
it("resolveDemo: home fav loses 0-1 → lost, net -100,000", () => {
  const r = resolveDemo(favBet, 0, 1);
  expect(r.status).toBe("lost");
  expect(r.netMmk).toBe(-100_000);
});
it("applyResult moves balance by net (win)", () => {
  expect(applyResult(START_BALANCE, { status: "won", netMmk: 92_000 })).toBe(
    1_092_000,
  );
});
it("START_BALANCE is 1,000,000 demo MMK", () => {
  expect(START_BALANCE).toBe(1_000_000);
});
