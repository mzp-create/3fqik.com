import { describe, it, expect } from "vitest";
import { gradeBet, gradeDetail, type GradeInput } from "./grade";

const S = 100_000;

type Case = {
  name: string;
  input: GradeInput;
  net: number;
  status: "won" | "push" | "lost";
  result: "win" | "push" | "lose" | "half-win" | "half-lose";
};

// ballQ ×4: N=1→4, N=0.5→2, N=0.75→3, N=0.25→1, N=2→8, N=2.25→9, N=2.75→11
const CASES: Case[] = [
  // ── AH fav, WHOLE N=1, positive p=+0.50 ──
  {
    name: "AH fav +0.50 whole win (m2>1) → +0.50S",
    input: {
      market: "ah",
      side: "fav",
      ballQ: 4,
      priceC: 50,
      stake: S,
      effFav: 2,
      effDog: 0,
    },
    net: 50_000,
    status: "won",
    result: "win",
  },
  {
    name: "AH fav +0.50 whole push (m1=1) → 0",
    input: {
      market: "ah",
      side: "fav",
      ballQ: 4,
      priceC: 50,
      stake: S,
      effFav: 1,
      effDog: 0,
    },
    net: 0,
    status: "push",
    result: "push",
  },
  {
    name: "AH fav +0.50 whole lose (m0<1) → −S",
    input: {
      market: "ah",
      side: "fav",
      ballQ: 4,
      priceC: 50,
      stake: S,
      effFav: 0,
      effDog: 0,
    },
    net: -100_000,
    status: "lost",
    result: "lose",
  },

  // ── AH fav, WHOLE N=1, NEGATIVE p (canonical: win S/|p|, lose −S) ──
  {
    name: "AH fav −0.50 whole win → +S/0.50 = +200,000",
    input: {
      market: "ah",
      side: "fav",
      ballQ: 4,
      priceC: -50,
      stake: S,
      effFav: 2,
      effDog: 0,
    },
    net: 200_000,
    status: "won",
    result: "win",
  },
  {
    name: "AH fav −0.50 whole lose → −S (full stake)",
    input: {
      market: "ah",
      side: "fav",
      ballQ: 4,
      priceC: -50,
      stake: S,
      effFav: 0,
      effDog: 0,
    },
    net: -100_000,
    status: "lost",
    result: "lose",
  },
  {
    name: "AH fav −0.90 whole win → +S/0.90 = 111,111 (round)",
    input: {
      market: "ah",
      side: "fav",
      ballQ: 4,
      priceC: -90,
      stake: S,
      effFav: 2,
      effDog: 0,
    },
    net: 111_111,
    status: "won",
    result: "win",
  },
  {
    name: "AH fav −0.90 whole lose → −S",
    input: {
      market: "ah",
      side: "fav",
      ballQ: 4,
      priceC: -90,
      stake: S,
      effFav: 0,
      effDog: 0,
    },
    net: -100_000,
    status: "lost",
    result: "lose",
  },

  // ── AH dog, WHOLE N=1 ──
  {
    name: "AH dog +0.15 whole win (m0<1) → +0.15S",
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
    name: "AH dog −0.80 whole win → +S/0.80 = 125,000",
    input: {
      market: "ah",
      side: "dog",
      ballQ: 4,
      priceC: -80,
      stake: S,
      effFav: 0,
      effDog: 0,
    },
    net: 125_000,
    status: "won",
    result: "win",
  },
  {
    name: "AH dog −0.80 whole lose → −S",
    input: {
      market: "ah",
      side: "dog",
      ballQ: 4,
      priceC: -80,
      stake: S,
      effFav: 2,
      effDog: 0,
    },
    net: -100_000,
    status: "lost",
    result: "lose",
  },

  // ── HALF line N=0.5 (never pushes) ──
  {
    name: "AH fav +0.50 half win (m1>0.5)",
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
    name: "AH fav −0.50 half win → +200,000",
    input: {
      market: "ah",
      side: "fav",
      ballQ: 2,
      priceC: -50,
      stake: S,
      effFav: 1,
      effDog: 0,
    },
    net: 200_000,
    status: "won",
    result: "win",
  },
  {
    name: "AH fav +0.50 half lose (m0<0.5)",
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

  // ── QUARTER N=0.75 (ballQ 3): legs 0.5 & 1.0 ── ★ half outcomes
  {
    name: "AH fav +0.92 q0.75 full win (m2) → +0.92S",
    input: {
      market: "ah",
      side: "fav",
      ballQ: 3,
      priceC: 92,
      stake: S,
      effFav: 2,
      effDog: 0,
    },
    net: 92_000,
    status: "won",
    result: "win",
  },
  {
    name: "AH fav +0.92 q0.75 HALF-WIN (m1: leg0.5 win, leg1.0 push) → +46,000",
    input: {
      market: "ah",
      side: "fav",
      ballQ: 3,
      priceC: 92,
      stake: S,
      effFav: 1,
      effDog: 0,
    },
    net: 46_000,
    status: "won",
    result: "half-win",
  },
  {
    name: "AH fav +0.92 q0.75 full lose (m0) → −S",
    input: {
      market: "ah",
      side: "fav",
      ballQ: 3,
      priceC: 92,
      stake: S,
      effFav: 0,
      effDog: 0,
    },
    net: -100_000,
    status: "lost",
    result: "lose",
  },
  {
    name: "AH fav −0.90 q0.75 HALF-WIN (m1) → +S/2/0.90 = 55,556 (sum-then-round)",
    input: {
      market: "ah",
      side: "fav",
      ballQ: 3,
      priceC: -90,
      stake: S,
      effFav: 1,
      effDog: 0,
    },
    net: 55_556,
    status: "won",
    result: "half-win",
  },

  // ── QUARTER N=0.25 (ballQ 1): legs 0 & 0.5 ── ★ half-lose
  {
    name: "AH fav +0.92 q0.25 full win (m1) → +0.92S",
    input: {
      market: "ah",
      side: "fav",
      ballQ: 1,
      priceC: 92,
      stake: S,
      effFav: 1,
      effDog: 0,
    },
    net: 92_000,
    status: "won",
    result: "win",
  },
  {
    name: "AH fav +0.92 q0.25 HALF-LOSE (m0: leg0 push, leg0.5 lose) → −50,000",
    input: {
      market: "ah",
      side: "fav",
      ballQ: 1,
      priceC: 92,
      stake: S,
      effFav: 0,
      effDog: 0,
    },
    net: -50_000,
    status: "lost",
    result: "half-lose",
  },
  {
    name: "AH fav +0.92 q0.25 full lose (m−1) → −S",
    input: {
      market: "ah",
      side: "fav",
      ballQ: 1,
      priceC: 92,
      stake: S,
      effFav: 0,
      effDog: 1,
    },
    net: -100_000,
    status: "lost",
    result: "lose",
  },

  // ── QUARTER dog N=0.75 (ballQ 3): dog wins when value<Nk ── ★ half-lose
  {
    name: "AH dog +0.92 q0.75 full win (m0) → +0.92S",
    input: {
      market: "ah",
      side: "dog",
      ballQ: 3,
      priceC: 92,
      stake: S,
      effFav: 0,
      effDog: 0,
    },
    net: 92_000,
    status: "won",
    result: "win",
  },
  {
    name: "AH dog +0.92 q0.75 HALF-LOSE (m1: leg0.5 lose, leg1.0 push) → −50,000",
    input: {
      market: "ah",
      side: "dog",
      ballQ: 3,
      priceC: 92,
      stake: S,
      effFav: 1,
      effDog: 0,
    },
    net: -50_000,
    status: "lost",
    result: "half-lose",
  },

  // ── O/U over, WHOLE N=2 ──
  {
    name: "OU over +0.50 whole win (t3>2)",
    input: {
      market: "ou",
      side: "over",
      ballQ: 8,
      priceC: 50,
      stake: S,
      effFav: 2,
      effDog: 1,
    },
    net: 50_000,
    status: "won",
    result: "win",
  },
  {
    name: "OU over +0.50 whole push (t2=2)",
    input: {
      market: "ou",
      side: "over",
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
    name: "OU over −0.90 whole win (t3) → 111,111",
    input: {
      market: "ou",
      side: "over",
      ballQ: 8,
      priceC: -90,
      stake: S,
      effFav: 2,
      effDog: 1,
    },
    net: 111_111,
    status: "won",
    result: "win",
  },

  // ── O/U over QUARTER N=2.25 (ballQ 9): legs 2.0 & 2.5 ── half-lose
  {
    name: "OU over +0.92 q2.25 HALF-LOSE (t2: leg2.0 push, leg2.5 lose) → −50,000",
    input: {
      market: "ou",
      side: "over",
      ballQ: 9,
      priceC: 92,
      stake: S,
      effFav: 1,
      effDog: 1,
    },
    net: -50_000,
    status: "lost",
    result: "half-lose",
  },
  {
    name: "OU over +0.92 q2.25 full win (t3) → +0.92S",
    input: {
      market: "ou",
      side: "over",
      ballQ: 9,
      priceC: 92,
      stake: S,
      effFav: 2,
      effDog: 1,
    },
    net: 92_000,
    status: "won",
    result: "win",
  },

  // ── O/U over QUARTER N=2.75 (ballQ 11): legs 2.5 & 3.0 ── half-win
  {
    name: "OU over +0.92 q2.75 HALF-WIN (t3: leg2.5 win, leg3.0 push) → +46,000",
    input: {
      market: "ou",
      side: "over",
      ballQ: 11,
      priceC: 92,
      stake: S,
      effFav: 2,
      effDog: 1,
    },
    net: 46_000,
    status: "won",
    result: "half-win",
  },

  // ── O/U under QUARTER N=2.25 (ballQ 9): under wins when total<Nk ── half-win
  {
    name: "OU under +0.92 q2.25 HALF-WIN (t2: leg2.0 push, leg2.5 win) → +46,000",
    input: {
      market: "ou",
      side: "under",
      ballQ: 9,
      priceC: 92,
      stake: S,
      effFav: 1,
      effDog: 1,
    },
    net: 46_000,
    status: "won",
    result: "half-win",
  },

  // ── rounding (sum then round half-away-from-zero, once) ──
  {
    name: "round pos win: +0.35 × 150 = 52.5 → 53 (whole)",
    input: {
      market: "ah",
      side: "fav",
      ballQ: 4,
      priceC: 35,
      stake: 150,
      effFav: 2,
      effDog: 0,
    },
    net: 53,
    status: "won",
    result: "win",
  },
  {
    name: "round neg win: −0.35 whole, stake 150 → 150·100/35 = 428.57 → 429",
    input: {
      market: "ah",
      side: "fav",
      ballQ: 4,
      priceC: -35,
      stake: 150,
      effFav: 2,
      effDog: 0,
    },
    net: 429,
    status: "won",
    result: "win",
  },

  // ── boundaries ±1.00 = even money ──
  {
    name: "+1.00 whole win → +S",
    input: {
      market: "ah",
      side: "fav",
      ballQ: 4,
      priceC: 100,
      stake: S,
      effFav: 2,
      effDog: 0,
    },
    net: 100_000,
    status: "won",
    result: "win",
  },
  {
    name: "−1.00 whole win → +S",
    input: {
      market: "ah",
      side: "fav",
      ballQ: 4,
      priceC: -100,
      stake: S,
      effFav: 2,
      effDog: 0,
    },
    net: 100_000,
    status: "won",
    result: "win",
  },
];

describe("gradeBet — canonical Malay + quarter splitting", () => {
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

describe("gradeDetail legs", () => {
  it("whole line → 1 leg", () => {
    const d = gradeDetail({
      market: "ah",
      side: "fav",
      ballQ: 4,
      priceC: 50,
      stake: S,
      effFav: 2,
      effDog: 0,
    });
    expect(d.legs).toHaveLength(1);
    expect(d.legs[0].lineGoals).toBe(1);
    expect(d.legs[0].result).toBe("win");
  });
  it("quarter line → 2 legs on adjacent lines", () => {
    const d = gradeDetail({
      market: "ah",
      side: "fav",
      ballQ: 3,
      priceC: 92,
      stake: S,
      effFav: 1,
      effDog: 0,
    });
    expect(d.legs.map((l) => l.lineGoals)).toEqual([0.5, 1]);
    expect(d.legs.map((l) => l.result)).toEqual(["win", "push"]);
    expect(d.result).toBe("half-win");
    expect(d.lineGoals).toBe(0.75);
    expect(d.value).toBe(1);
  });
});

describe("validation", () => {
  const base = {
    market: "ah",
    side: "fav",
    ballQ: 4,
    priceC: 50,
    stake: S,
    effFav: 2,
    effDog: 0,
  } as const;
  it("rejects price 0", () =>
    expect(() => gradeBet({ ...base, priceC: 0 })).toThrow());
  it("rejects price > 100", () =>
    expect(() => gradeBet({ ...base, priceC: 101 })).toThrow());
  it("rejects price < −100", () =>
    expect(() => gradeBet({ ...base, priceC: -101 })).toThrow());
  it("rejects ballQ > 40", () =>
    expect(() => gradeBet({ ...base, ballQ: 41 })).toThrow());
  it("rejects ballQ < 0", () =>
    expect(() => gradeBet({ ...base, ballQ: -1 })).toThrow());
  it("rejects stake 0", () =>
    expect(() => gradeBet({ ...base, stake: 0 })).toThrow());
  it("rejects wrong side for market", () =>
    // @ts-expect-error over is not valid for ah
    expect(() => gradeBet({ ...base, side: "over" })).toThrow());
});
