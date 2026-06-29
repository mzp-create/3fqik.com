import { it, expect } from "vitest";
import { winNeed } from "./format";

const base = { favName: "Mexico", dogName: "Canada", live: false };

it("AH fav whole line (−1.0): win by 2+, push on exactly 1", () => {
  const r = winNeed({ ...base, market: "ah", side: "fav", ballQ: 4 });
  expect(r.text).toBe("Mexico wins by 2+");
  expect(r.push).toBe("Mexico wins by exactly 1 — stake back");
  expect(r.half).toBeUndefined();
});

it("AH fav quarter (−0.75): full win by 2+, half-win by exactly 1", () => {
  const r = winNeed({ ...base, market: "ah", side: "fav", ballQ: 3 });
  expect(r.text).toBe("Mexico wins by 2+");
  expect(r.push).toBeUndefined();
  expect(r.half).toBe("Mexico wins by exactly 1 — half win");
});

it("AH fav quarter (−0.25): win by 1+, half-loss on a draw", () => {
  const r = winNeed({ ...base, market: "ah", side: "fav", ballQ: 1 });
  expect(r.text).toBe("Mexico wins");
  expect(r.half).toBe("a draw — half loss");
});

it("AH dog quarter (+0.75): full win on draw or loss, half-loss if fav by 1", () => {
  const r = winNeed({ ...base, market: "ah", side: "dog", ballQ: 3 });
  expect(r.text).toBe("Canada wins or draws");
  expect(r.half).toBe("Mexico wins by exactly 1 — half loss");
});

it("AH dog whole line (−1.0 fav): dog wins or draws, push if fav by exactly 1", () => {
  const r = winNeed({ ...base, market: "ah", side: "dog", ballQ: 4 });
  expect(r.text).toBe("Canada wins or draws");
  expect(r.push).toBe("Mexico wins by exactly 1 — stake back");
});

it("O/U over whole (2.5): 3+ goals", () => {
  const r = winNeed({ ...base, market: "ou", side: "over", ballQ: 10 });
  expect(r.text).toBe("3 or more goals");
  expect(r.push).toBeUndefined();
});

it("O/U over whole (2.0): 3+ goals, push on exactly 2", () => {
  const r = winNeed({ ...base, market: "ou", side: "over", ballQ: 8 });
  expect(r.text).toBe("3 or more goals");
  expect(r.push).toBe("exactly 2 goals — stake back");
});

it("O/U over quarter (2.75): full win 4+, half-win on exactly 3", () => {
  const r = winNeed({ ...base, market: "ou", side: "over", ballQ: 11 });
  expect(r.text).toBe("4 or more goals");
  expect(r.half).toBe("exactly 3 goals — half win");
});

it("live phrasing still applies", () => {
  const fav = winNeed({
    ...base,
    market: "ah",
    side: "fav",
    ballQ: 4,
    live: true,
  });
  expect(fav.text).toBe("Mexico outscores Canada by 2+ from now");
});
