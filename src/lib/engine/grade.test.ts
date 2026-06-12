import { describe, it, expect } from "vitest";
import { gradeBet, type GradeInput } from "./grade";

type AhCase = {
  name: string;
  market: "ah";
  side: "fav" | "dog";
  ballQ: number;
  priceC: number;
  stake: number;
  effFav: number;
  effDog: number;
  status: string;
  net: number;
};

type OuCase = {
  name: string;
  market: "ou";
  side: "over" | "under";
  ballQ: number;
  priceC: number;
  stake: number;
  effFav: number;
  effDog: number;
  status: string;
  net: number;
};

type Case = AhCase | OuCase;

const T: Case[] = [
  // ---- AH: full ball (ballQ multiple of 4): pushes possible
  {
    name: "fav -1.0 wins by 2",
    market: "ah",
    side: "fav",
    ballQ: 4,
    priceC: 92,
    stake: 100_000,
    effFav: 2,
    effDog: 0,
    status: "won",
    net: 92_000,
  },
  {
    name: "fav -1.0 wins by 1 → push",
    market: "ah",
    side: "fav",
    ballQ: 4,
    priceC: 92,
    stake: 100_000,
    effFav: 1,
    effDog: 0,
    status: "push",
    net: 0,
  },
  {
    name: "fav -1.0 draws → lost",
    market: "ah",
    side: "fav",
    ballQ: 4,
    priceC: 92,
    stake: 100_000,
    effFav: 0,
    effDog: 0,
    status: "lost",
    net: -100_000,
  },
  {
    name: "dog +1.0 loses by 1 → push",
    market: "ah",
    side: "dog",
    ballQ: 4,
    priceC: -98,
    stake: 100_000,
    effFav: 1,
    effDog: 0,
    status: "push",
    net: 0,
  },
  {
    name: "dog +1.0 draws → won (neg price wins stake)",
    market: "ah",
    side: "dog",
    ballQ: 4,
    priceC: -98,
    stake: 100_000,
    effFav: 0,
    effDog: 0,
    status: "won",
    net: 100_000,
  },
  {
    name: "dog +1.0 loses by 2 → lost (neg price)",
    market: "ah",
    side: "dog",
    ballQ: 4,
    priceC: -98,
    stake: 100_000,
    effFav: 2,
    effDog: 0,
    status: "lost",
    net: -98_000,
  },

  // ---- AH: half ball (ballQ ≡ 2 mod 4): no pushes
  {
    name: "fav -0.5 wins by 1",
    market: "ah",
    side: "fav",
    ballQ: 2,
    priceC: 85,
    stake: 200_000,
    effFav: 1,
    effDog: 0,
    status: "won",
    net: 170_000,
  },
  {
    name: "fav -0.5 draws → lost",
    market: "ah",
    side: "fav",
    ballQ: 2,
    priceC: 85,
    stake: 200_000,
    effFav: 0,
    effDog: 0,
    status: "lost",
    net: -200_000,
  },
  {
    name: "dog +0.5 draws → won",
    market: "ah",
    side: "dog",
    ballQ: 2,
    priceC: -95,
    stake: 300_000,
    effFav: 0,
    effDog: 0,
    status: "won",
    net: 300_000,
  },
  {
    name: "dog +0.5 loses by 1 → lost",
    market: "ah",
    side: "dog",
    ballQ: 2,
    priceC: -95,
    stake: 300_000,
    effFav: 1,
    effDog: 0,
    status: "lost",
    net: -285_000,
  },

  // ---- AH: quarter ball: split halves
  // fav -0.75 @0.92, stake 100k, wins by 1: half -0.5 wins (+46,000), half -1.0 pushes → half_won
  {
    name: "fav -0.75 wins by 1 → half_won",
    market: "ah",
    side: "fav",
    ballQ: 3,
    priceC: 92,
    stake: 100_000,
    effFav: 1,
    effDog: 0,
    status: "half_won",
    net: 46_000,
  },
  {
    name: "fav -0.75 wins by 2 → won",
    market: "ah",
    side: "fav",
    ballQ: 3,
    priceC: 92,
    stake: 100_000,
    effFav: 2,
    effDog: 0,
    status: "won",
    net: 92_000,
  },
  {
    name: "fav -0.75 draws → lost",
    market: "ah",
    side: "fav",
    ballQ: 3,
    priceC: 92,
    stake: 100_000,
    effFav: 0,
    effDog: 0,
    status: "lost",
    net: -100_000,
  },
  // fav -0.25 @-0.90, stake 100k, draw: half 0 pushes, half -0.5 loses 45,000 → half_lost
  {
    name: "fav -0.25 neg price draws → half_lost",
    market: "ah",
    side: "fav",
    ballQ: 1,
    priceC: -90,
    stake: 100_000,
    effFav: 0,
    effDog: 0,
    status: "half_lost",
    net: -45_000,
  },
  // dog +0.25 @-0.98 draw: half +0 pushes, half +0.5 wins 50,000 → half_won
  {
    name: "dog +0.25 neg price draws → half_won",
    market: "ah",
    side: "dog",
    ballQ: 1,
    priceC: -98,
    stake: 100_000,
    effFav: 0,
    effDog: 0,
    status: "half_won",
    net: 50_000,
  },
  {
    name: "dog +0.25 loses by 1 → lost",
    market: "ah",
    side: "dog",
    ballQ: 1,
    priceC: -98,
    stake: 100_000,
    effFav: 1,
    effDog: 0,
    status: "lost",
    net: -98_000,
  },

  // ---- AH: live bet: effective score already offset by caller; same math
  // bet at 1-0 on dog +0.75 @0.90, final 2-1 → eff 1-1, diff 0 →
  // halves +0.5 and +1.0 both win; priceC 90 > 0 so each pays S/2 × 0.90 = 45,000 → won, +90,000
  {
    name: "live dog +0.75 eff draw → won",
    market: "ah",
    side: "dog",
    ballQ: 3,
    priceC: 90,
    stake: 100_000,
    effFav: 1,
    effDog: 1,
    status: "won",
    net: 90_000,
  },

  // ---- AH: ball 0 (level): pure push possibilities
  {
    name: "level ball draw → push",
    market: "ah",
    side: "fav",
    ballQ: 0,
    priceC: 95,
    stake: 50_000,
    effFav: 1,
    effDog: 1,
    status: "push",
    net: 0,
  },

  // ---- AH: odd stake rounding: half stakes round half-away-from-zero once at the end
  {
    name: "quarter ball odd stake rounds",
    market: "ah",
    side: "fav",
    ballQ: 3,
    priceC: 85,
    stake: 33_333,
    effFav: 1,
    effDog: 0,
    status: "half_won",
    net: 14_167,
  }, // 16666.5*0.85 = 14166.525 → 14167

  // ---- AH: .5-MMK ties: pin half-away-from-zero (plain Math.round would give −16,666)
  {
    name: "negative half-MMK tie rounds away from zero",
    market: "ah",
    side: "dog",
    ballQ: 3,
    priceC: -100,
    stake: 33_333,
    effFav: 1,
    effDog: 0,
    status: "half_lost",
    net: -16_667,
  },
  {
    name: "positive half-MMK tie rounds away from zero",
    market: "ah",
    side: "fav",
    ballQ: 3,
    priceC: 100,
    stake: 33_333,
    effFav: 1,
    effDog: 0,
    status: "half_won",
    net: 16_667,
  },
  // ---- AH: coverage gaps
  {
    name: "dog +0.75 pos price loses half",
    market: "ah",
    side: "dog",
    ballQ: 3,
    priceC: 80,
    stake: 100_000,
    effFav: 1,
    effDog: 0,
    status: "half_lost",
    net: -50_000,
  },
  {
    name: "fav -0.5 neg price wins",
    market: "ah",
    side: "fav",
    ballQ: 2,
    priceC: -85,
    stake: 100_000,
    effFav: 1,
    effDog: 0,
    status: "won",
    net: 100_000,
  },
  {
    name: "fav -2.5 wins by 3",
    market: "ah",
    side: "fav",
    ballQ: 10,
    priceC: 95,
    stake: 100_000,
    effFav: 3,
    effDog: 0,
    status: "won",
    net: 95_000,
  },
  {
    name: "fav -2.5 wins by 2 → lost",
    market: "ah",
    side: "fav",
    ballQ: 10,
    priceC: 95,
    stake: 100_000,
    effFav: 2,
    effDog: 0,
    status: "lost",
    net: -100_000,
  },
  {
    name: "fav -3.0 wins by 3 → push",
    market: "ah",
    side: "fav",
    ballQ: 12,
    priceC: -90,
    stake: 100_000,
    effFav: 3,
    effDog: 0,
    status: "push",
    net: 0,
  },
  {
    name: "fav -0.25 when dog leads → lost",
    market: "ah",
    side: "fav",
    ballQ: 1,
    priceC: 90,
    stake: 100_000,
    effFav: 0,
    effDog: 2,
    status: "lost",
    net: -100_000,
  },
  {
    name: "fav -0.75 stake 99,999 @0.33 → half_won",
    market: "ah",
    side: "fav",
    ballQ: 3,
    priceC: 33,
    stake: 99_999,
    effFav: 1,
    effDog: 0,
    status: "half_won",
    net: 16_500,
  },
  {
    name: "dog +0.25 odd stake full loss exact",
    market: "ah",
    side: "dog",
    ballQ: 1,
    priceC: 95,
    stake: 33_333,
    effFav: 2,
    effDog: 0,
    status: "lost",
    net: -33_333,
  },

  // ============================================================
  // O/U MARKET TESTS
  // ============================================================
  // Notation: ballQ = goals_line × 4; totalQ = 4 * (effFav + effDog)
  // Over margin  = totalQ − ballQ; Under margin = ballQ − totalQ
  // Malay payouts: p>0 win→+S×p, lose→−S; p<0 win→+S, lose→−S×|p|

  // ---- O/U: full-ball lines (ballQ ≡ 0 mod 4, push possible)

  // O 2.5 @0.90 stake 100k, total 3:
  //   totalQ=12, ballQ=10, over margin=12−10=2>0 → win
  //   p=90>0: net=100k×90/100=+90,000 → won
  {
    name: "ou: O 2.5 @0.90 total 3 → won +90,000",
    market: "ou",
    side: "over",
    ballQ: 10,
    priceC: 90,
    stake: 100_000,
    effFav: 2,
    effDog: 1,
    status: "won",
    net: 90_000,
  },

  // O 2.5 @0.90 stake 100k, total 2:
  //   totalQ=8, ballQ=10, over margin=8−10=−2<0 → lose
  //   p=90>0: net=−100k → lost
  {
    name: "ou: O 2.5 @0.90 total 2 → lost −100,000",
    market: "ou",
    side: "over",
    ballQ: 10,
    priceC: 90,
    stake: 100_000,
    effFav: 1,
    effDog: 1,
    status: "lost",
    net: -100_000,
  },

  // U 2.5 @−0.95 stake 200k, total 2:
  //   totalQ=8, ballQ=10, under margin=10−8=2>0 → win
  //   p=−95<0: win→+stake=+200,000 → won
  {
    name: "ou: U 2.5 @-0.95 total 2 → won +200,000",
    market: "ou",
    side: "under",
    ballQ: 10,
    priceC: -95,
    stake: 200_000,
    effFav: 1,
    effDog: 1,
    status: "won",
    net: 200_000,
  },

  // U 2.5 @−0.95 stake 200k, total 3:
  //   totalQ=12, ballQ=10, under margin=10−12=−2<0 → lose
  //   p=−95<0: lose→−200k×95/100=−190,000 → lost
  {
    name: "ou: U 2.5 @-0.95 total 3 → lost −190,000",
    market: "ou",
    side: "under",
    ballQ: 10,
    priceC: -95,
    stake: 200_000,
    effFav: 2,
    effDog: 1,
    status: "lost",
    net: -190_000,
  },

  // O 2.0 @0.85 stake 100k, total 2:
  //   totalQ=8, ballQ=8, over margin=8−8=0 → push
  //   net=0 → push
  {
    name: "ou: O 2.0 @0.85 total 2 → push 0",
    market: "ou",
    side: "over",
    ballQ: 8,
    priceC: 85,
    stake: 100_000,
    effFav: 1,
    effDog: 1,
    status: "push",
    net: 0,
  },

  // ---- O/U: quarter-ball lines (ballQ odd)

  // O 2.25 @0.92 stake 100k, total 2:
  //   ballQ=9 (odd→quarter), halves at ballQ=8 and ballQ=10
  //   totalQ=8 (effFav=1, effDog=1)
  //   half@ballQ=8: over margin=8−8=0 → push; net=0
  //   half@ballQ=10: over margin=8−10=−2<0 → lose; net=−50k
  //   combined: push+lose → half_lost; total=−50,000
  {
    name: "ou: O 2.25 @0.92 total 2 → half_lost −50,000",
    market: "ou",
    side: "over",
    ballQ: 9,
    priceC: 92,
    stake: 100_000,
    effFav: 1,
    effDog: 1,
    status: "half_lost",
    net: -50_000,
  },

  // O 2.25 @0.92 stake 100k, total 3:
  //   totalQ=12 (effFav=2, effDog=1)
  //   half@ballQ=8: over margin=12−8=4>0 → win; net=50k×92/100=46,000
  //   half@ballQ=10: over margin=12−10=2>0 → win; net=50k×92/100=46,000
  //   combined: win+win → won; total=+92,000
  {
    name: "ou: O 2.25 @0.92 total 3 → won +92,000",
    market: "ou",
    side: "over",
    ballQ: 9,
    priceC: 92,
    stake: 100_000,
    effFav: 2,
    effDog: 1,
    status: "won",
    net: 92_000,
  },

  // U 2.75 @−0.90 stake 100k, total 3:
  //   ballQ=11 (odd→quarter), halves at ballQ=10 and ballQ=12
  //   totalQ=12 (effFav=2, effDog=1)
  //   half@ballQ=10: under margin=10−12=−2<0 → lose; net=−(50k×90/100)=−45,000
  //   half@ballQ=12: under margin=12−12=0 → push; net=0
  //   combined: lose+push → half_lost; total=−45,000
  {
    name: "ou: U 2.75 @-0.90 total 3 → half_lost −45,000",
    market: "ou",
    side: "under",
    ballQ: 11,
    priceC: -90,
    stake: 100_000,
    effFav: 2,
    effDog: 1,
    status: "half_lost",
    net: -45_000,
  },

  // U 2.75 @−0.90 stake 100k, total 2:
  //   totalQ=8 (effFav=1, effDog=1)
  //   half@ballQ=10: under margin=10−8=2>0 → win; net=+50k
  //   half@ballQ=12: under margin=12−8=4>0 → win; net=+50k
  //   combined: win+win → won; total=+100,000
  {
    name: "ou: U 2.75 @-0.90 total 2 → won +100,000",
    market: "ou",
    side: "under",
    ballQ: 11,
    priceC: -90,
    stake: 100_000,
    effFav: 1,
    effDog: 1,
    status: "won",
    net: 100_000,
  },

  // ---- O/U: live-offset bets (caller passes effective per-team values)

  // bet at 1-0 on O 1.5 (eff total = final total − 1):
  // effFav=2, effDog=1 → eff total=3; totalQ=12; ballQ=6(1.5×4)
  // over margin=12−6=6>0 → won; p=90>0: net=100k×90/100=+90,000
  {
    name: "ou: live O 1.5 eff total 3 → won +90,000",
    market: "ou",
    side: "over",
    ballQ: 6,
    priceC: 90,
    stake: 100_000,
    effFav: 2,
    effDog: 1,
    status: "won",
    net: 90_000,
  },

  // effFav=0, effDog=1 → eff total=1; totalQ=4; ballQ=6
  // over margin=4−6=−2<0 → lost; net=−100,000
  {
    name: "ou: live O 1.5 eff total 1 → lost −100,000",
    market: "ou",
    side: "over",
    ballQ: 6,
    priceC: 90,
    stake: 100_000,
    effFav: 0,
    effDog: 1,
    status: "lost",
    net: -100_000,
  },

  // ---- O/U: tie-rounding pin (half-away-from-zero)

  // U 2.75 @−100 stake 33,333 total 3:
  //   ballQ=11 (odd→quarter), halves at ballQ=10 and ballQ=12; half-stake=16,666.5
  //   totalQ=12 (effFav=2, effDog=1)
  //   half@ballQ=10: under margin=10−12=−2<0 → lose; net=−(16,666.5×100/100)=−16,666.5
  //   half@ballQ=12: under margin=12−12=0 → push; net=0
  //   combined exact=−16,666.5 → roundHalfAwayFromZero=−16,667 → half_lost
  {
    name: "ou: U 2.75 @-100 stake 33,333 total 3 → half_lost −16,667 (pin away-from-zero)",
    market: "ou",
    side: "under",
    ballQ: 11,
    priceC: -100,
    stake: 33_333,
    effFav: 2,
    effDog: 1,
    status: "half_lost",
    net: -16_667,
  },

  // ---- O/U: half_won + cross price-sign gap coverage
  {
    name: "ou: O 2.75 @0.92 total 3 → half_won +46,000",
    market: "ou",
    side: "over",
    ballQ: 11,
    priceC: 92,
    stake: 100_000,
    effFav: 2,
    effDog: 1,
    status: "half_won",
    net: 46_000,
  },
  {
    name: "ou: U 2.25 @-0.95 total 2 → half_won +50,000",
    market: "ou",
    side: "under",
    ballQ: 9,
    priceC: -95,
    stake: 100_000,
    effFav: 1,
    effDog: 1,
    status: "half_won",
    net: 50_000,
  },
  {
    name: "ou: O 2.5 @-0.90 total 3 → won +100,000",
    market: "ou",
    side: "over",
    ballQ: 10,
    priceC: -90,
    stake: 100_000,
    effFav: 2,
    effDog: 1,
    status: "won",
    net: 100_000,
  },
  {
    name: "ou: O 2.5 @-0.90 total 2 → lost −90,000",
    market: "ou",
    side: "over",
    ballQ: 10,
    priceC: -90,
    stake: 100_000,
    effFav: 1,
    effDog: 1,
    status: "lost",
    net: -90_000,
  },
  {
    name: "ou: U 3.0 @0.88 total 2 → won +88,000",
    market: "ou",
    side: "under",
    ballQ: 12,
    priceC: 88,
    stake: 100_000,
    effFav: 1,
    effDog: 1,
    status: "won",
    net: 88_000,
  },
  {
    name: "ou: U 3.0 @0.88 total 4 → lost −100,000",
    market: "ou",
    side: "under",
    ballQ: 12,
    priceC: 88,
    stake: 100_000,
    effFav: 2,
    effDog: 2,
    status: "lost",
    net: -100_000,
  },
  {
    name: "ou: U 2.0 @0.85 total 2 → push 0",
    market: "ou",
    side: "under",
    ballQ: 8,
    priceC: 85,
    stake: 100_000,
    effFav: 2,
    effDog: 0,
    status: "push",
    net: 0,
  },
  {
    name: "ou: O 2.75 @100 stake 33,333 total 3 → half_won +16,667 (pin away-from-zero)",
    market: "ou",
    side: "over",
    ballQ: 11,
    priceC: 100,
    stake: 33_333,
    effFav: 3,
    effDog: 0,
    status: "half_won",
    net: 16_667,
  },
];

describe("gradeBet", () => {
  for (const c of T) {
    it(c.name, () => {
      // c is AhCase | OuCase; spreading into gradeBet widens the union —
      // runtime pairing is guaranteed by table construction, cast is safe.
      const r = gradeBet({
        market: c.market,
        side: c.side,
        ballQ: c.ballQ,
        priceC: c.priceC,
        stake: c.stake,
        effFav: c.effFav,
        effDog: c.effDog,
      } as GradeInput);
      expect(r.status).toBe(c.status);
      expect(r.netMmk).toBe(c.net);
    });
  }

  it("rejects invalid inputs", () => {
    expect(() =>
      gradeBet({
        market: "ah",
        side: "fav",
        ballQ: -1,
        priceC: 92,
        stake: 1000,
        effFav: 0,
        effDog: 0,
      }),
    ).toThrow();
    expect(() =>
      gradeBet({
        market: "ah",
        side: "fav",
        ballQ: 0,
        priceC: 0,
        stake: 1000,
        effFav: 0,
        effDog: 0,
      }),
    ).toThrow();
    expect(() =>
      gradeBet({
        market: "ah",
        side: "fav",
        ballQ: 0,
        priceC: 92,
        stake: 0,
        effFav: 0,
        effDog: 0,
      }),
    ).toThrow();
    expect(() =>
      gradeBet({
        market: "ah",
        side: "fav",
        ballQ: 4,
        priceC: 92,
        stake: 1000.5,
        effFav: 0,
        effDog: 0,
      }),
    ).toThrow();
    expect(() =>
      gradeBet({
        market: "ah",
        side: "fav",
        ballQ: 4,
        priceC: 101,
        stake: 1000,
        effFav: 0,
        effDog: 0,
      }),
    ).toThrow();
    expect(() =>
      gradeBet({
        market: "ah",
        side: "fav",
        ballQ: 4,
        priceC: -101,
        stake: 1000,
        effFav: 0,
        effDog: 0,
      }),
    ).toThrow();
    expect(() =>
      gradeBet({
        market: "ah",
        side: "fav",
        ballQ: 2.5,
        priceC: 92,
        stake: 1000,
        effFav: 0,
        effDog: 0,
      }),
    ).toThrow();
    expect(() =>
      gradeBet({
        market: "ah",
        side: "fav",
        ballQ: 4,
        priceC: 92,
        stake: 1000,
        effFav: 1.5,
        effDog: 0,
      }),
    ).toThrow();
    expect(() =>
      gradeBet({
        market: "ah",
        side: "fav",
        ballQ: 4,
        priceC: 92,
        stake: 1000,
        effFav: 0,
        effDog: -1,
      }),
    ).toThrow();
    expect(() =>
      gradeBet({
        market: "ah",
        side: "fav",
        ballQ: 44,
        priceC: 92,
        stake: 1000,
        effFav: 0,
        effDog: 0,
      }),
    ).toThrow(); // ball cap
    expect(() =>
      gradeBet({
        market: "ah",
        side: "dog",
        ballQ: 4,
        priceC: 92,
        stake: 2_000_000_000_000,
        effFav: 0,
        effDog: 0,
      }),
    ).toThrow(); // stake cap
    // runtime side validation — garbage value bypasses TS union
    expect(() =>
      gradeBet({
        market: "ah",
        // @ts-expect-error — intentionally invalid side to test runtime guard
        side: "x",
        ballQ: 4,
        priceC: 92,
        stake: 1000,
        effFav: 0,
        effDog: 0,
      }),
    ).toThrow();
    // ±100 are legitimate even-money Malay prices — accepted, pay identically:
    expect(
      gradeBet({
        market: "ah",
        side: "fav",
        ballQ: 2,
        priceC: 100,
        stake: 1000,
        effFav: 1,
        effDog: 0,
      }),
    ).toEqual({ status: "won", netMmk: 1000 });
    expect(
      gradeBet({
        market: "ah",
        side: "fav",
        ballQ: 2,
        priceC: -100,
        stake: 1000,
        effFav: 0,
        effDog: 0,
      }),
    ).toEqual({ status: "lost", netMmk: -1000 });
  });

  it("-0 guard: netMmk is never negative zero", () => {
    expect(
      Object.is(
        gradeBet({
          market: "ah",
          side: "dog",
          ballQ: 2,
          priceC: -20,
          stake: 1,
          effFav: 1,
          effDog: 0,
        }).netMmk,
        -0,
      ),
    ).toBe(false);
  });

  // ---- invalid market — distinct runtime guard
  it("rejects garbage market", () => {
    expect(() =>
      gradeBet({
        // @ts-expect-error — intentionally invalid market to test runtime guard
        market: "x",
        side: "fav",
        ballQ: 4,
        priceC: 92,
        stake: 1000,
        effFav: 0,
        effDog: 0,
      }),
    ).toThrow(/invalid market/);
  });

  // ---- invalid market/side combos (runtime validation; discriminated union enforced at TS level)
  it("rejects ah market with over/under sides", () => {
    expect(() =>
      // @ts-expect-error — intentionally mismatched side for ah market
      gradeBet({
        market: "ah",
        side: "over",
        ballQ: 4,
        priceC: 92,
        stake: 1000,
        effFav: 2,
        effDog: 0,
      }),
    ).toThrow("invalid side for market");
    expect(() =>
      // @ts-expect-error — intentionally mismatched side for ah market
      gradeBet({
        market: "ah",
        side: "under",
        ballQ: 4,
        priceC: 92,
        stake: 1000,
        effFav: 0,
        effDog: 2,
      }),
    ).toThrow("invalid side for market");
  });

  it("rejects ou market with fav/dog sides", () => {
    expect(() =>
      // @ts-expect-error — intentionally mismatched side for ou market
      gradeBet({
        market: "ou",
        side: "fav",
        ballQ: 10,
        priceC: 90,
        stake: 1000,
        effFav: 2,
        effDog: 1,
      }),
    ).toThrow("invalid side for market");
    expect(() =>
      // @ts-expect-error — intentionally mismatched side for ou market
      gradeBet({
        market: "ou",
        side: "dog",
        ballQ: 10,
        priceC: 90,
        stake: 1000,
        effFav: 1,
        effDog: 2,
      }),
    ).toThrow("invalid side for market");
  });
});
