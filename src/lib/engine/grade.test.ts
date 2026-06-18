import { describe, it, expect } from "vitest";
import { gradeBet, gradeDetail, type GradeInput } from "./grade";

const S = 100_000;

type Case = {
  name: string;
  input: GradeInput;
  net: number;
  status: "won" | "push" | "lost";
  result: "win" | "push" | "lose";
};

// ballQ ×4: N=3 → ballQ 12, N=1 → 4, N=4 → 16, N=2 → 8, N=0.5 → 2
const CASES: Case[] = [
  // ── AH favourite, N=3 (Spain −3 style) ──
  {
    name: "AH fav +0.35 win (margin 4>3) → +0.35S",
    input: {
      market: "ah",
      side: "fav",
      ballQ: 12,
      priceC: 35,
      stake: S,
      effFav: 4,
      effDog: 0,
    },
    net: 35_000,
    status: "won",
    result: "win",
  },
  {
    name: "AH fav +0.35 exact (margin 3=3) → push refund",
    input: {
      market: "ah",
      side: "fav",
      ballQ: 12,
      priceC: 35,
      stake: S,
      effFav: 3,
      effDog: 0,
    },
    net: 0,
    status: "push",
    result: "push",
  },
  {
    name: "AH fav +0.35 lose (margin 2<3) → −S",
    input: {
      market: "ah",
      side: "fav",
      ballQ: 12,
      priceC: 35,
      stake: S,
      effFav: 2,
      effDog: 0,
    },
    net: -100_000,
    status: "lost",
    result: "lose",
  },
  {
    name: "AH fav −0.90 win (margin 4>3) → +S",
    input: {
      market: "ah",
      side: "fav",
      ballQ: 12,
      priceC: -90,
      stake: S,
      effFav: 4,
      effDog: 0,
    },
    net: 100_000,
    status: "won",
    result: "win",
  },
  {
    name: "AH fav −0.90 lose (margin 2<3) → −0.90S",
    input: {
      market: "ah",
      side: "fav",
      ballQ: 12,
      priceC: -90,
      stake: S,
      effFav: 2,
      effDog: 0,
    },
    net: -90_000,
    status: "lost",
    result: "lose",
  },
  {
    name: "AH fav loses match (margin −2<3) → lose −S",
    input: {
      market: "ah",
      side: "fav",
      ballQ: 4,
      priceC: 20,
      stake: S,
      effFav: 0,
      effDog: 2,
    },
    net: -100_000,
    status: "lost",
    result: "lose",
  },

  // ── AH dog, N=1 ──
  {
    name: "AH dog +0.15 win (margin 0<1) → +0.15S",
    input: {
      market: "ah",
      side: "dog",
      ballQ: 4,
      priceC: 15,
      stake: S,
      effFav: 0,
      effDog: 0,
    },
    net: 15_000,
    status: "won",
    result: "win",
  },
  {
    name: "AH dog +0.15 exact (margin 1=1) → push",
    input: {
      market: "ah",
      side: "dog",
      ballQ: 4,
      priceC: 15,
      stake: S,
      effFav: 1,
      effDog: 0,
    },
    net: 0,
    status: "push",
    result: "push",
  },
  {
    name: "AH dog +0.15 lose (margin 2>1) → −S",
    input: {
      market: "ah",
      side: "dog",
      ballQ: 4,
      priceC: 15,
      stake: S,
      effFav: 2,
      effDog: 0,
    },
    net: -100_000,
    status: "lost",
    result: "lose",
  },

  // ── O/U over ──
  {
    name: "O/U over 4 +0.75 win (total 5>4) → +0.75S",
    input: {
      market: "ou",
      side: "over",
      ballQ: 16,
      priceC: 75,
      stake: S,
      effFav: 3,
      effDog: 2,
    },
    net: 75_000,
    status: "won",
    result: "win",
  },
  {
    name: "O/U over 4 +0.75 exact (total 4=4) → push",
    input: {
      market: "ou",
      side: "over",
      ballQ: 16,
      priceC: 75,
      stake: S,
      effFav: 2,
      effDog: 2,
    },
    net: 0,
    status: "push",
    result: "push",
  },
  {
    name: "O/U over 4 +0.75 lose (total 3<4) → −S",
    input: {
      market: "ou",
      side: "over",
      ballQ: 16,
      priceC: 75,
      stake: S,
      effFav: 2,
      effDog: 1,
    },
    net: -100_000,
    status: "lost",
    result: "lose",
  },
  {
    name: "O/U over 2 −0.90 win (total 3>2) → +S",
    input: {
      market: "ou",
      side: "over",
      ballQ: 8,
      priceC: -90,
      stake: S,
      effFav: 2,
      effDog: 1,
    },
    net: 100_000,
    status: "won",
    result: "win",
  },
  {
    name: "O/U over 2 −0.90 lose (total 1<2) → −0.90S",
    input: {
      market: "ou",
      side: "over",
      ballQ: 8,
      priceC: -90,
      stake: S,
      effFav: 1,
      effDog: 0,
    },
    net: -90_000,
    status: "lost",
    result: "lose",
  },

  // ── O/U under, N=2 ──
  {
    name: "O/U under 2 +0.50 win (total 1<2) → +0.50S",
    input: {
      market: "ou",
      side: "under",
      ballQ: 8,
      priceC: 50,
      stake: S,
      effFav: 1,
      effDog: 0,
    },
    net: 50_000,
    status: "won",
    result: "win",
  },
  {
    name: "O/U under 2 +0.50 exact (total 2=2) → push",
    input: {
      market: "ou",
      side: "under",
      ballQ: 8,
      priceC: 50,
      stake: S,
      effFav: 1,
      effDog: 1,
    },
    net: 0,
    status: "push",
    result: "push",
  },
  {
    name: "O/U under 2 +0.50 lose (total 3>2) → −S",
    input: {
      market: "ou",
      side: "under",
      ballQ: 8,
      priceC: 50,
      stake: S,
      effFav: 2,
      effDog: 1,
    },
    net: -100_000,
    status: "lost",
    result: "lose",
  },

  // ── rounding (half-away-from-zero, once) ──
  {
    name: "round win: +0.35 × 150 = 52.5 → 53",
    input: {
      market: "ah",
      side: "fav",
      ballQ: 12,
      priceC: 35,
      stake: 150,
      effFav: 4,
      effDog: 0,
    },
    net: 53,
    status: "won",
    result: "win",
  },
  {
    name: "round lose neg: −0.35 × 150 = −52.5 → −53",
    input: {
      market: "ah",
      side: "fav",
      ballQ: 12,
      priceC: -35,
      stake: 150,
      effFav: 2,
      effDog: 0,
    },
    net: -53,
    status: "lost",
    result: "lose",
  },

  // ── half line (N=0.5): never pushes ──
  {
    name: "half line −0.5 win (margin 1>0.5)",
    input: {
      market: "ah",
      side: "fav",
      ballQ: 2,
      priceC: 50,
      stake: S,
      effFav: 1,
      effDog: 0,
    },
    net: 50_000,
    status: "won",
    result: "win",
  },
  {
    name: "half line −0.5 lose (margin 0<0.5)",
    input: {
      market: "ah",
      side: "fav",
      ballQ: 2,
      priceC: 50,
      stake: S,
      effFav: 0,
      effDog: 0,
    },
    net: -100_000,
    status: "lost",
    result: "lose",
  },

  // ── live bet: effFav/effDog are after-bet goals ──
  {
    name: "live AH fav +0.20 (after-bet 2–0, margin 2>1) → +0.20S",
    input: {
      market: "ah",
      side: "fav",
      ballQ: 4,
      priceC: 20,
      stake: S,
      effFav: 2,
      effDog: 0,
    },
    net: 20_000,
    status: "won",
    result: "win",
  },
];

describe("gradeBet — Malay signed-price model", () => {
  for (const c of CASES) {
    it(c.name, () => {
      const r = gradeBet(c.input);
      expect(r.netMmk).toBe(c.net);
      expect(r.status).toBe(c.status);
      const d = gradeDetail(c.input);
      expect(d.result).toBe(c.result);
      expect(d.netMmk).toBe(c.net);
    });
  }
});

describe("gradeDetail fields", () => {
  it("reports margin/total, line, and signed price", () => {
    const ah = gradeDetail({
      market: "ah",
      side: "fav",
      ballQ: 12,
      priceC: 35,
      stake: S,
      effFav: 4,
      effDog: 1,
    });
    expect(ah.lineGoals).toBe(3);
    expect(ah.value).toBe(3); // margin 4−1
    expect(ah.result).toBe("push"); // margin 3 = N 3
    expect(ah.priceC).toBe(35);

    const ou = gradeDetail({
      market: "ou",
      side: "over",
      ballQ: 16,
      priceC: -90,
      stake: S,
      effFav: 3,
      effDog: 3,
    });
    expect(ou.lineGoals).toBe(4);
    expect(ou.value).toBe(6); // total
    expect(ou.result).toBe("win");
    expect(ou.priceC).toBe(-90);
  });
});

describe("validation", () => {
  const base = {
    market: "ah",
    side: "fav",
    ballQ: 12,
    priceC: 35,
    stake: S,
    effFav: 4,
    effDog: 0,
  } as const;
  it("rejects price 0", () =>
    expect(() => gradeBet({ ...base, priceC: 0 })).toThrow());
  it("rejects price > 100", () =>
    expect(() => gradeBet({ ...base, priceC: 101 })).toThrow());
  it("rejects price < −100", () =>
    expect(() => gradeBet({ ...base, priceC: -101 })).toThrow());
  it("accepts price −100 and +100", () => {
    expect(gradeBet({ ...base, priceC: -100 }).netMmk).toBe(100_000); // win p<0 → +S
    expect(gradeBet({ ...base, priceC: 100 }).netMmk).toBe(100_000); // win +1.00S
  });
  it("rejects ballQ > 40", () =>
    expect(() => gradeBet({ ...base, ballQ: 41 })).toThrow());
  it("rejects ballQ < 0", () =>
    expect(() => gradeBet({ ...base, ballQ: -1 })).toThrow());
  it("rejects stake 0", () =>
    expect(() => gradeBet({ ...base, stake: 0 })).toThrow());
  it("rejects wrong side for market", () => {
    // @ts-expect-error over is not valid for ah
    expect(() => gradeBet({ ...base, side: "over" })).toThrow();
  });
});
