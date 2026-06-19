import { it, expect } from "vitest";
import { winNeed } from "./format";

const base = { favName: "Mexico", dogName: "Canada", live: false };

it("AH fav quarter line (−0.75): any win, no push", () => {
  const r = winNeed({ ...base, market: "ah", side: "fav", ballQ: 3 });
  expect(r.text).toBe("Mexico wins");
  expect(r.push).toBeUndefined();
});

it("AH fav whole line (−1.0): win by 2+, push on exactly 1", () => {
  const r = winNeed({ ...base, market: "ah", side: "fav", ballQ: 4 });
  expect(r.text).toBe("Mexico wins by 2+");
  expect(r.push).toBe("Mexico wins by exactly 1 — stake back");
});

it("AH dog quarter line (+0.75): win or draw", () => {
  const r = winNeed({ ...base, market: "ah", side: "dog", ballQ: 3 });
  expect(r.text).toBe("Canada wins or draws");
  expect(r.push).toBeUndefined();
});

it("AH dog whole line (+1.0): win or draw, push on fav-by-1", () => {
  const r = winNeed({ ...base, market: "ah", side: "dog", ballQ: 4 });
  expect(r.text).toBe("Canada wins or draws");
  expect(r.push).toBe("Mexico wins by exactly 1 — stake back");
});

it("AH dog +1.75: loses-by-1 still wins the bet", () => {
  const r = winNeed({ ...base, market: "ah", side: "dog", ballQ: 7 });
  expect(r.text).toBe("Canada wins, draws, or loses by 1");
});

it("O/U over 2.5: 3 or more goals", () => {
  const r = winNeed({ ...base, market: "ou", side: "over", ballQ: 10 });
  expect(r.text).toBe("3 or more goals");
  expect(r.push).toBeUndefined();
});

it("O/U under 2.5: 2 or fewer goals", () => {
  const r = winNeed({ ...base, market: "ou", side: "under", ballQ: 10 });
  expect(r.text).toBe("2 or fewer goals");
});

it("O/U over 2.0 (whole): 3+ goals, push on exactly 2", () => {
  const r = winNeed({ ...base, market: "ou", side: "over", ballQ: 8 });
  expect(r.text).toBe("3 or more goals");
  expect(r.push).toBe("exactly 2 goals — stake back");
});

it("live bet phrases the condition 'from now'", () => {
  const fav = winNeed({
    ...base,
    live: true,
    market: "ah",
    side: "fav",
    ballQ: 4,
  });
  expect(fav.text).toBe("Mexico outscores Canada by 2+ from now");
  const over = winNeed({
    ...base,
    live: true,
    market: "ou",
    side: "over",
    ballQ: 10,
  });
  expect(over.text).toBe("3 or more goals from now");
});
