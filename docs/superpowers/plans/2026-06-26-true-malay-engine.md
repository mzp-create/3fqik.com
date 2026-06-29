# True Malay Grading + Line-Pricing Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current grading engine with a canonical Malay system — negative-price win pays `S·100/|p|`, every loss is the full stake, and quarter lines (`.25`/`.75`) split 50/50 into two legs producing half-win/half-loss/half-push — then drop the vestigial `offered_side` column and wipe + re-grade existing data, exporting an Excel of all bets with results.

**Architecture:** All money math stays in the pure `src/lib/engine/grade.ts` kernel; `settleMatch.ts` and the practice store consume it unchanged. `gradeDetail` gains a `legs[]` breakdown so displays can render half outcomes. A migration drops `offered_side`. The existing `scripts/regrade.ts` is rewritten to wipe settlement effects, re-grade from each bet's snapshot price, and emit a JSON dump; an xlsx is produced from that dump.

**Tech Stack:** Next.js 16, TypeScript, Drizzle ORM + Postgres (PGlite in tests), vitest, xlsx skill (python/openpyxl) for the export.

**Spec:** `docs/superpowers/specs/2026-06-26-true-malay-engine-design.md`

---

## File Structure

- `src/lib/engine/grade.ts` — **rewrite.** Add leg splitting + canonical payout. New `LegDetail` type; `GradeDetail` gains `legs[]` and extended `result`.
- `src/lib/engine/grade.test.ts` — **rewrite.** New authoritative table.
- `src/lib/client/gradeBreakdown.ts` — **modify.** Render half outcomes + corrected negative-win text from `legs`.
- `src/lib/client/gradeBreakdown.test.ts` — **create.** Cover half-win/half-loss/negative-win.
- `src/lib/client/format.ts` (`winNeed`) — **modify.** Quarter-line phrasing (`half?`).
- `src/lib/client/winNeed.test.ts` — **rewrite the quarter cases.**
- `src/lib/db/schema.ts` — **modify.** Drop `offered_side` column.
- `drizzle/0007_drop_offered_side.sql` — **create.**
- `src/lib/lines/manage.ts` — **modify.** Stop writing `offeredSide`.
- `src/components/MatchCard.tsx` — **modify.** Drop `offeredSide` from `LineRow` type.
- `src/lib/bets/place.test.ts` — **modify.** Drop `offeredSide` from a line fixture (line ~873).
- `scripts/record-sithu-bets.ts`, `record-sithu-batch2.ts`..`batch5.ts` — **modify.** Drop `offeredSide` from the line insert.
- `scripts/regrade.ts` — **rewrite.** Option-C wipe + re-grade from snapshot price + JSON dump.

---

## Task 1: Rewrite the grading engine

**Files:**

- Modify: `src/lib/engine/grade.ts`
- Test: `src/lib/engine/grade.test.ts` (full replacement)

- [ ] **Step 1: Replace the test table.** Overwrite `src/lib/engine/grade.test.ts` with:

```ts
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
```

- [ ] **Step 2: Run the test, confirm it fails.**

Run: `npx vitest run src/lib/engine/grade.test.ts`
Expected: FAIL (the new `result: "half-win"` / `legs` assertions don't exist yet; old engine never returns half outcomes).

- [ ] **Step 3: Rewrite `src/lib/engine/grade.ts`** with this exact content:

```ts
// Canonical Malay signed-price grading with Asian-handicap quarter-line splitting.
// See docs/superpowers/specs/2026-06-26-true-malay-engine-design.md.
//
// Payout per leg (signed price p = priceC ×100; leg stake s):
//   WIN  → p>0: +(p/100)·s   p<0: +s·100/|p|
//   LOSE → −s   (full leg stake, both signs)
//   PUSH → 0
// A quarter line (ballQ odd) splits into two s = S/2 legs on the two nearest
// lines. Raw leg nets are summed, then rounded half-away-from-zero ONCE.

export type GradeInput = {
  ballQ: number; // line ×4, integer 0–40
  priceC: number; // signed Malay price ×100, integer in [−100,−1] ∪ [1,100]
  stake: number; // MMK, integer > 0
  effFav: number; // favourite's (home's) effective goals for this bet
  effDog: number; // dog's (away's) effective goals for this bet
} & (
  | { market: "ah"; side: "fav" | "dog" }
  | { market: "ou"; side: "over" | "under" }
);

export type GradeResult = {
  status: "won" | "push" | "lost";
  netMmk: number;
};

export type LegDetail = {
  lineGoals: number; // this leg's line N
  result: "win" | "push" | "lose";
  net: number; // this leg's raw (un-rounded) net
};

export type GradeDetail = {
  status: "won" | "push" | "lost";
  netMmk: number;
  market: "ah" | "ou";
  lineGoals: number; // the bet's nominal line N (ballQ/4)
  value: number; // margin (ah) or total (ou)
  result: "win" | "push" | "lose" | "half-win" | "half-lose";
  priceC: number;
  legs: LegDetail[]; // 1 (whole/half) or 2 (quarter)
};

function roundHalfAwayFromZero(x: number): number {
  return Math.sign(x) * Math.round(Math.abs(x)) || 0;
}

function legResultFor(
  side: "fav" | "dog" | "over" | "under",
  value: number,
  N: number,
): "win" | "push" | "lose" {
  if (value === N) return "push";
  const beyond = side === "fav" || side === "over" ? value > N : value < N;
  return beyond ? "win" : "lose";
}

function legNetFor(
  result: "win" | "push" | "lose",
  priceC: number,
  legStake: number,
): number {
  if (result === "push") return 0;
  if (result === "lose") return -legStake;
  // win: positive price pays p·s; negative price pays s/|p| (canonical Malay)
  return priceC > 0
    ? (priceC * legStake) / 100
    : (legStake * 100) / Math.abs(priceC);
}

function compute(i: GradeInput): GradeDetail {
  if (i.market !== "ah" && i.market !== "ou") throw new Error("invalid market");
  if (i.market === "ah") {
    if (i.side !== "fav" && i.side !== "dog")
      throw new Error("invalid side for market");
  } else {
    if (i.side !== "over" && i.side !== "under")
      throw new Error("invalid side for market");
  }
  if (!Number.isInteger(i.ballQ) || i.ballQ < 0 || i.ballQ > 40)
    throw new Error("invalid ballQ: must be integer 0–40");
  if (
    !Number.isInteger(i.priceC) ||
    i.priceC < -100 ||
    i.priceC > 100 ||
    i.priceC === 0
  )
    throw new Error("invalid priceC: must be integer in [−100,−1] ∪ [1,100]");
  if (!Number.isInteger(i.stake) || i.stake <= 0 || i.stake > 1_000_000_000)
    throw new Error("invalid stake: must be positive integer ≤ 1,000,000,000");
  if (
    !Number.isInteger(i.effFav) ||
    !Number.isInteger(i.effDog) ||
    i.effFav < 0 ||
    i.effDog < 0
  )
    throw new Error("invalid effective score: must be non-negative integers");

  const N = i.ballQ / 4;
  const value = i.market === "ah" ? i.effFav - i.effDog : i.effFav + i.effDog;

  // Quarter line (ballQ odd) splits into the two nearest lines; whole/half lines
  // (ballQ even) are a single leg on N.
  const isQuarter = i.ballQ % 2 === 1;
  const legLines = isQuarter ? [(i.ballQ - 1) / 4, (i.ballQ + 1) / 4] : [N];
  const legStake = i.stake / legLines.length;

  const legs: LegDetail[] = legLines.map((Nk) => {
    const result = legResultFor(i.side, value, Nk);
    return {
      lineGoals: Nk,
      result,
      net: legNetFor(result, i.priceC, legStake),
    };
  });

  const netMmk = roundHalfAwayFromZero(legs.reduce((s, l) => s + l.net, 0));

  const wins = legs.filter((l) => l.result === "win").length;
  const loses = legs.filter((l) => l.result === "lose").length;
  const pushes = legs.filter((l) => l.result === "push").length;

  // Adjacent quarter legs differ by 0.5 with an integer `value`, so win+lose can
  // never co-occur. Status is therefore unambiguous from the leg counts.
  let status: "won" | "push" | "lost";
  let result: GradeDetail["result"];
  if (wins > 0 && loses === 0) {
    status = "won";
    result = pushes > 0 ? "half-win" : "win";
  } else if (loses > 0 && wins === 0) {
    status = "lost";
    result = pushes > 0 ? "half-lose" : "lose";
  } else {
    status = "push"; // all legs push
    result = "push";
  }

  return {
    status,
    netMmk,
    market: i.market,
    lineGoals: N,
    value,
    result,
    priceC: i.priceC,
    legs,
  };
}

export function gradeBet(i: GradeInput): GradeResult {
  const { status, netMmk } = compute(i);
  return { status, netMmk };
}

export function gradeDetail(i: GradeInput): GradeDetail {
  return compute(i);
}
```

- [ ] **Step 4: Run the test, confirm it passes.**

Run: `npx vitest run src/lib/engine/grade.test.ts`
Expected: PASS (all cases + legs + validation).

- [ ] **Step 5: Run the full suite to see the blast radius.**

Run: `npm test`
Expected: `grade.test.ts` green. `winNeed.test.ts` will FAIL (quarter cases — fixed in Task 3). `gradeBreakdown` has no test yet. settle/place/practice/accounting tests should stay GREEN (they use positive prices and margins/totals clear of split boundaries). If any _other_ test fails, STOP and investigate — it means a downstream expectation actually changed.

- [ ] **Step 6: Commit.**

```bash
git add src/lib/engine/grade.ts src/lib/engine/grade.test.ts
git commit -m "feat(engine): canonical Malay payout + quarter-line splitting"
```

---

## Task 2: Update `gradeBreakdown` for half outcomes + negative-win text

**Files:**

- Modify: `src/lib/client/gradeBreakdown.ts`
- Test: `src/lib/client/gradeBreakdown.test.ts` (create)

Context: the current `gradeBreakdown` branches on `d.result === "push" | "win" | else(lose)`, so it would mis-render the new `"half-win"`/`"half-lose"` values as a loss. The negative-win text also says "(full stake)" which is now wrong.

- [ ] **Step 1: Write the failing test.** Create `src/lib/client/gradeBreakdown.test.ts`:

```ts
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
```

- [ ] **Step 2: Run, confirm fail.**

Run: `npx vitest run src/lib/client/gradeBreakdown.test.ts`
Expected: FAIL (`Breakdown.result` is typed `"win"|"push"|"lose"`; half values not produced).

- [ ] **Step 3: Update `src/lib/client/gradeBreakdown.ts`.** Change the `Breakdown` type and the result-line block:

Change the type:

```ts
export type Breakdown = {
  scoreLine: string;
  mathLine: string;
  resultLine: string;
  result: "win" | "push" | "lose" | "half-win" | "half-lose";
  net: number;
};
```

Replace the `resultLine` block (the `if (d.result === "push") … else …` chain) with:

```ts
const net = d.netMmk;
const win = d.result === "win" || d.result === "half-win";
const half = d.result === "half-win" || d.result === "half-lose";
const priceTerm =
  b.priceC > 0
    ? `${priceSigned(b.priceC)} × ${mmk(b.stakeMmk)}`
    : `${mmk(b.stakeMmk)} ÷ ${(Math.abs(b.priceC) / 100).toFixed(2)}`;
let resultLine: string;
if (d.result === "push") {
  resultLine = "PUSH — stake refunded";
} else if (win) {
  resultLine = `${half ? "HALF-WON" : "WON"} +${mmk(net)} (${priceTerm}${half ? ", half stake" : ""})`;
} else {
  // lose / half-lose: a loss is always the full (leg) stake
  resultLine = `${half ? "HALF-LOST" : "LOST"} −${mmk(Math.abs(net))} (full ${half ? "half-" : ""}stake)`;
}

return { scoreLine, mathLine, resultLine, result: d.result, net };
```

(The `mathLine` above it is unchanged — it already prints margin/total vs `d.lineGoals` and the signed price.)

- [ ] **Step 4: Run, confirm pass.**

Run: `npx vitest run src/lib/client/gradeBreakdown.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/lib/client/gradeBreakdown.ts src/lib/client/gradeBreakdown.test.ts
git commit -m "feat(display): render half outcomes + correct negative-win text"
```

---

## Task 3: Quarter-line phrasing in `winNeed`

**Files:**

- Modify: `src/lib/client/format.ts` (`winNeed`, ~line 149)
- Test: `src/lib/client/winNeed.test.ts`

Context: the current `winNeed` assumes only whole lines have a "stake back" zone. For quarter lines it currently claims "any win, no push", hiding the half-win/half-loss zone. Add an optional `half?: string` note.

- [ ] **Step 1: Rewrite the quarter cases in `src/lib/client/winNeed.test.ts`.** Replace the two AH quarter tests (the `ballQ: 3` fav and dog cases) and add OU quarter coverage. Final file:

```ts
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

it("AH dog whole line (−1.0 fav): dog wins, draws, or loses by exactly... push note", () => {
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
```

- [ ] **Step 2: Run, confirm fail.**

Run: `npx vitest run src/lib/client/winNeed.test.ts`
Expected: FAIL (no `half` field; quarter text differs).

- [ ] **Step 3: Update `winNeed` in `src/lib/client/format.ts`.** Change the return type to include `half?: string` and compute it for quarter lines. Replace the whole `winNeed` function body with:

```ts
export function winNeed(opts: {
  market: "ah" | "ou";
  side: "fav" | "dog" | "over" | "under";
  ballQ: number;
  favName: string;
  dogName: string;
  live: boolean;
}): { text: string; push?: string; half?: string } {
  const { market, side, ballQ, favName, dogName, live } = opts;
  const N = ballQ / 4;
  const whole = ballQ % 4 === 0;
  const quarter = ballQ % 2 === 1;
  const from = live ? " from now" : "";
  // Leg lines: a quarter splits into the two nearest lines; the integer one is
  // where a leg can push (→ a half outcome). The non-integer leg never pushes.
  const legs = quarter ? [(ballQ - 1) / 4, (ballQ + 1) / 4] : [N];
  const intLeg = legs.find((l) => Number.isInteger(l));

  if (market === "ou") {
    if (side === "over") {
      const hi = Math.max(...legs);
      const min = Math.floor(hi) + 1; // smallest integer total > the farther leg
      const push = whole
        ? `exactly ${N} goal${N === 1 ? "" : "s"}${from} — stake back`
        : undefined;
      // over half: total === intLeg. Lower int leg (N=k.25) → half-loss; upper (N=k.75) → half-win.
      const half =
        quarter && intLeg !== undefined
          ? `exactly ${intLeg} goal${intLeg === 1 ? "" : "s"}${from} — ${intLeg === Math.max(...legs) ? "half win" : "half loss"}`
          : undefined;
      return { text: `${min} or more goals${from}`, push, half };
    }
    // under
    const lo = Math.min(...legs);
    const max = Math.ceil(lo) - 1; // largest integer total < the nearer leg
    const push = whole
      ? `exactly ${N} goal${N === 1 ? "" : "s"}${from} — stake back`
      : undefined;
    const half =
      quarter && intLeg !== undefined
        ? `exactly ${intLeg} goal${intLeg === 1 ? "" : "s"}${from} — ${intLeg === Math.min(...legs) ? "half win" : "half loss"}`
        : undefined;
    return {
      text: max <= 0 ? `no goals${from}` : `${max} or fewer goals${from}`,
      push,
      half,
    };
  }

  // Asian handicap.
  const pushAh =
    whole && N >= 1
      ? `${favName} ${live ? `outscores ${dogName}` : "wins"} by exactly ${N}${from} — stake back`
      : whole && N === 0
        ? `a draw${from} — stake back`
        : undefined;

  if (side === "fav") {
    const hi = Math.max(...legs);
    const by = Math.floor(hi) + 1; // smallest integer margin clearing the farther leg
    const verb = live ? `outscores ${dogName}` : "wins";
    const text =
      by <= 1
        ? `${favName} ${verb}${from}`
        : `${favName} ${verb} by ${by}+${from}`;
    // fav half: margin === intLeg. Upper int leg (N=k.75) → half-win; lower (N=k.25, incl 0) → half-loss.
    let half: string | undefined;
    if (quarter && intLeg !== undefined) {
      const kind = intLeg === Math.max(...legs) ? "half win" : "half loss";
      half =
        intLeg === 0
          ? `a draw${from} — ${kind}`
          : `${favName} ${verb} by exactly ${intLeg}${from} — ${kind}`;
    }
    return { text, push: pushAh, half };
  }

  // dog: wins when margin < N.
  const lo = Math.min(...legs);
  const maxMargin = Math.ceil(lo) - 1; // largest integer margin strictly below the nearer leg
  let text: string;
  if (maxMargin < 0) {
    text = live ? `${dogName} outscores ${favName}${from}` : `${dogName} wins`;
  } else if (maxMargin === 0) {
    text = live
      ? `${dogName} is not outscored${from}`
      : `${dogName} wins or draws`;
  } else {
    text = live
      ? `${dogName} not outscored by ${maxMargin + 1}+${from}`
      : `${dogName} wins, draws, or loses by ${maxMargin}`;
  }
  // dog half: margin === intLeg. Lower int leg (N=k.25) → half-win; upper (N=k.75) → half-loss.
  let half: string | undefined;
  if (quarter && intLeg !== undefined) {
    const kind = intLeg === Math.min(...legs) ? "half win" : "half loss";
    half =
      intLeg === 0
        ? `a draw${from} — ${kind}`
        : `${favName} ${live ? `outscores ${dogName}` : "wins"} by exactly ${intLeg}${from} — ${kind}`;
  }
  return { text, push: pushAh, half };
}
```

- [ ] **Step 4: Run, confirm pass.**

Run: `npx vitest run src/lib/client/winNeed.test.ts`
Expected: PASS. If a phrasing assertion is off by wording, the test is the spec — align the string in the implementation (the _zones_ — which value is half-win vs half-loss vs full — must stay as in the test; only wording may be tweaked).

- [ ] **Step 5: Commit.**

```bash
git add src/lib/client/format.ts src/lib/client/winNeed.test.ts
git commit -m "feat(display): quarter-line half-win/half-loss phrasing in winNeed"
```

---

## Task 4: Drop the vestigial `offered_side` column

**Files:**

- Create: `drizzle/0007_drop_offered_side.sql`
- Modify: `src/lib/db/schema.ts` (lines ~93-97), `src/lib/lines/manage.ts` (line ~110), `src/components/MatchCard.tsx` (line 13), `src/lib/bets/place.test.ts` (~line 873), `scripts/record-sithu-bets.ts` + `record-sithu-batch2.ts`..`batch5.ts`

- [ ] **Step 1: Write the migration.** Create `drizzle/0007_drop_offered_side.sql`:

```sql
ALTER TABLE "lines" DROP COLUMN "offered_side";
```

- [ ] **Step 2: Remove the column from the schema.** In `src/lib/db/schema.ts`, delete the `offeredSide` field from the `lines` table (the `offered_side` text-enum block, ~lines 93-97).

- [ ] **Step 3: Stop writing it in `manage.ts`.** In `src/lib/lines/manage.ts` `postLine`, delete the `offeredSide: input.market === "ah" ? "fav" : "over",` line (and its comment) from the insert `.values({...})`.

- [ ] **Step 4: Clean up the remaining references.**
  - `src/components/MatchCard.tsx`: delete the `offeredSide: "fav" | "dog" | "over" | "under";` line from the `LineRow` type.
  - `src/lib/bets/place.test.ts` (~line 873): delete the `offeredSide: "fav",` line from the line fixture.
  - `scripts/record-sithu-bets.ts` (~line 129) and `record-sithu-batch2.ts`..`batch5.ts`: delete the `offeredSide: b.side,` (or equivalent) line from each `.insert(schema.lines).values({...})`.

  Verify none remain:

  Run: `grep -rn "offeredSide\|offered_side" src/ scripts/`
  Expected: no matches in `.ts`/`.tsx` (only `drizzle/0002_*.sql` and `drizzle/meta/*` history may still mention it — those are immutable history, leave them).

- [ ] **Step 5: Apply the migration and run the suite.**

Run: `npm run db:migrate` (against the dev `DATABASE_URL`), then `npm test`
Expected: migration applies; all currently-passing tests stay green (PGlite test DB rebuilds from `drizzle/*.sql`).

- [ ] **Step 6: Build to catch type errors from the dropped field.**

Run: `npm run build`
Expected: clean TS compile.

- [ ] **Step 7: Commit.**

```bash
git add drizzle/0007_drop_offered_side.sql src/lib/db/schema.ts src/lib/lines/manage.ts src/components/MatchCard.tsx src/lib/bets/place.test.ts scripts/record-sithu-*.ts
git commit -m "refactor(schema): drop vestigial offered_side column"
```

> **Deploy note:** at deploy, run `npm run db:migrate` against BOTH `worldbet` and `worldbet_staging` (export each `DATABASE_URL`).

---

## Task 5: Full-suite + lint + build gate

**Files:** none (verification only)

- [ ] **Step 1: Run the whole suite.**

Run: `npm test`
Expected: ALL green. If `settleMatch.test.ts` / `place.test.ts` / `settle.test.ts` / `dashboard.test.ts` / `practice.test.ts` fail, a margin/total in a fixture actually crosses a split boundary or uses a negative price — hand-verify the new value against the Task-1 table and update that single expectation, then re-run.

- [ ] **Step 2: Lint + build.**

Run: `npm run lint && npm run build`
Expected: clean.

- [ ] **Step 3: Commit any fixups** (only if Step 1 required an expectation change).

```bash
git add -A && git commit -m "test: align downstream expectations with canonical Malay engine"
```

---

## Task 6: Rewrite `scripts/regrade.ts` — Option-C wipe + re-grade + JSON dump

**Files:**

- Modify: `scripts/regrade.ts`
- Create dir: `scripts/out/` (gitignored)

Context: the existing `regrade.ts` (a) grades from `line.priceC`, ignoring the bet's snapshot `bet.priceC` (wrong for dog/under bets on two-sided lines), and (b) preserves settlements. Option C wants: wipe settlement effects, reset bets to graded-from-scratch, grade from the snapshot price, and dump JSON for the Excel.

- [ ] **Step 1: Gitignore the output dir.** Append to `.gitignore`:

```
scripts/out/
```

- [ ] **Step 2: Replace `scripts/regrade.ts`** with:

```ts
/**
 * Option-C wipe + re-grade. Destructive on settlement state:
 *   1. delete all settlements; null bets.settlement_id
 *   2. demote settled match_days → closed
 *   3. re-grade every non-void bet on a finished match under the canonical Malay
 *      engine, FROM THE BET'S SNAPSHOT PRICE (bets.price_c), not the line
 *   4. write scripts/out/regrade-bets.json (per-bet detail for the Excel export)
 *   5. print a per-player old-vs-new summary
 *
 * Guards: DRY_RUN=1 computes + dumps JSON but writes nothing to the DB.
 *         CONFIRM=1 is required to actually mutate (safety).
 * Usage: DRY_RUN=1 npm run db:regrade   |   CONFIRM=1 npm run db:regrade
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { and, eq, ne, isNotNull } from "drizzle-orm";
import { getDb, schema } from "../src/lib/db/index";
import { gradeDetail, type GradeInput } from "../src/lib/engine/grade";
import { computeFee } from "../src/lib/fees";

type Acc = { old: number; neu: number; n: number };

async function main() {
  const db = getDb();
  const dryRun = process.env.DRY_RUN === "1";
  const confirmed = process.env.CONFIRM === "1";
  if (!dryRun && !confirmed) {
    console.error("Refusing to mutate without CONFIRM=1 (or use DRY_RUN=1).");
    process.exit(1);
  }

  const [settingsRow] = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.id, 1));
  const commissionPct = settingsRow?.commissionPct ?? 3;
  const discountPct = settingsRow?.discountPct ?? 2;

  // ── 1+2: wipe settlement effects ──
  if (!dryRun) {
    await db
      .update(schema.bets)
      .set({ settlementId: null })
      .where(isNotNull(schema.bets.settlementId));
    await db.delete(schema.settlements);
    await db
      .update(schema.matchDays)
      .set({ status: "closed" })
      .where(eq(schema.matchDays.status, "settled"));
  }

  const finished = await db
    .select()
    .from(schema.matches)
    .where(eq(schema.matches.status, "finished"));
  const players = await db
    .select({ id: schema.players.id, name: schema.players.displayName })
    .from(schema.players);
  const nameOf = new Map(players.map((p) => [p.id, p.name]));

  const byPlayer = new Map<number, Acc>();
  const dump: Record<string, unknown>[] = [];
  let regraded = 0;

  for (const match of finished) {
    const finalHome = match.homeScore!;
    const finalAway = match.awayScore!;
    const linesRows = await db
      .select()
      .from(schema.lines)
      .where(eq(schema.lines.matchId, match.id));
    const lines = new Map(linesRows.map((l) => [l.id, l]));
    const bets = await db
      .select()
      .from(schema.bets)
      .where(
        and(eq(schema.bets.matchId, match.id), ne(schema.bets.status, "void")),
      );

    for (const bet of bets) {
      const line = lines.get(bet.lineId);
      if (!line) {
        console.warn(`SKIP ${bet.ticketNo}: line ${bet.lineId} missing`);
        continue;
      }
      const effHome = Math.max(finalHome - bet.scoreHomeAtBet, 0);
      const effAway = Math.max(finalAway - bet.scoreAwayAtBet, 0);
      const effFav = line.favSide === "home" ? effHome : effAway;
      const effDog = line.favSide === "home" ? effAway : effHome;

      const d = gradeDetail({
        market: line.market,
        side: bet.side,
        ballQ: line.ballQ,
        priceC: bet.priceC ?? line.priceC, // snapshot price; fall back for legacy rows
        stake: bet.stakeMmk,
        effFav,
        effDog,
      } as GradeInput);
      const newFee = computeFee(d.netMmk, commissionPct, discountPct);

      const oldEff = (bet.netMmk ?? 0) + (bet.feeMmk ?? 0);
      const newEff = d.netMmk + newFee;
      const cur = byPlayer.get(bet.playerId) ?? { old: 0, neu: 0, n: 0 };
      cur.old += oldEff;
      cur.neu += newEff;
      cur.n += 1;
      byPlayer.set(bet.playerId, cur);

      dump.push({
        ticketNo: bet.ticketNo,
        player: nameOf.get(bet.playerId) ?? bet.playerId,
        match: `${match.homeTeam} v ${match.awayTeam}`,
        finalScore: `${finalHome}-${finalAway}`,
        market: line.market,
        side: bet.side,
        ballQ: line.ballQ,
        lineGoals: d.lineGoals,
        priceC: bet.priceC ?? line.priceC,
        stakeMmk: bet.stakeMmk,
        legs: d.legs,
        result: d.result,
        status: d.status,
        oldNet: bet.netMmk ?? 0,
        newNet: d.netMmk,
        newFee,
        deltaEff: newEff - oldEff,
      });

      if (!dryRun)
        await db
          .update(schema.bets)
          .set({
            status: d.status,
            netMmk: d.netMmk,
            feeMmk: newFee,
            settledAt: null,
          })
          .where(eq(schema.bets.id, bet.id));
      regraded++;
    }
  }

  mkdirSync("scripts/out", { recursive: true });
  writeFileSync("scripts/out/regrade-bets.json", JSON.stringify(dump, null, 2));

  const fmt = (n: number) => (n >= 0 ? "+" : "") + n.toLocaleString("en-US");
  console.log(
    `\n${dryRun ? "[DRY RUN — DB untouched] " : ""}Re-graded ${regraded} bet(s). Dump → scripts/out/regrade-bets.json\n`,
  );
  console.log("=== per-player old → new (effective net incl. fee) ===");
  for (const [pid, d] of [...byPlayer.entries()].sort(
    (a, b) => a[1].neu - a[1].old - (b[1].neu - b[1].old),
  )) {
    console.log(
      `  ${nameOf.get(pid) ?? pid}: old ${fmt(d.old)} → new ${fmt(d.neu)}  (Δ ${fmt(d.neu - d.old)})  [${d.n}]`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 3: Type-check the script.**

Run: `npx tsc --noEmit -p tsconfig.json` (or `npm run build`)
Expected: no type errors in `scripts/regrade.ts`.

- [ ] **Step 4: Dry-run against the dev DB.**

Run: `DRY_RUN=1 npm run db:regrade`
Expected: prints the per-player summary, writes `scripts/out/regrade-bets.json`, mutates nothing. Eyeball a few rows in the JSON against the Task-1 table by hand.

- [ ] **Step 5: Commit.**

```bash
git add scripts/regrade.ts .gitignore
git commit -m "feat(regrade): Option-C wipe + re-grade from snapshot price + JSON dump"
```

> **Production/staging run is a deploy step, not a code step:** back up first, run `CONFIRM=1 npm run db:regrade` on **staging**, eyeball, then prod. (`npm run db:regrade` must map to `tsx scripts/regrade.ts` in `package.json` — verify it does; it already exists per the current script.)

---

## Task 7: Excel export of all bets + grade results

**Files:**

- Input: `scripts/out/regrade-bets.json` (from Task 6)
- Output: `docs/out/regrade-bets.xlsx`

This runs after a real (or dry-run) regrade has produced the JSON. Use the **xlsx skill** (openpyxl) to build the workbook — do not hand-roll a writer.

- [ ] **Step 1: Invoke the xlsx skill** (`Skill: document-skills:xlsx`) and build `docs/out/regrade-bets.xlsx` from `scripts/out/regrade-bets.json`. One sheet "Bets", one row per dump entry, header row bold + frozen, with columns:

  `ticketNo · player · match · finalScore · market · side · ballQ · lineGoals · price (signed Malay, e.g. -0.90 from priceC/100) · stakeMmk · legs (flatten to "0.5:win/1.0:push") · result · status · oldNet · newNet · newFee · deltaEff`

  Right-align the money columns; format `price` as the signed two-decimal Malay value (`priceC/100`). Add a totals row at the bottom summing `oldNet`, `newNet`, `deltaEff`.

- [ ] **Step 2: Sanity-check the workbook.** Open/inspect: row count == JSON length; spot-check one half-win row (`result == "half-win"`, `newNet` ≈ half the full-win payout) and one negative-price win (`newNet > stakeMmk`).

- [ ] **Step 3: Deliver.** Send `docs/out/regrade-bets.xlsx` to the owner (SendUserFile) as the re-grade acceptance artifact. This is the gate before running `CONFIRM=1` on production.

---

## Self-Review notes

- **Spec coverage:** payout model → Task 1; quarter splitting → Task 1; `gradeDetail.legs` → Task 1; gradeBreakdown → Task 2; winNeed → Task 3; drop `offered_side` → Task 4; downstream tests → Tasks 1/5; wipe+re-grade (Option C) → Task 6; JSON dump + Excel → Tasks 6/7. All spec sections mapped.
- **Type consistency:** `GradeDetail.result` extended enum is used identically in Task 1 (engine), Task 2 (`Breakdown.result`), and the Task 6 dump. `LegDetail` shape (`lineGoals`/`result`/`net`) is consistent across engine + dump. `winNeed` return gains `half?` consistently in impl + tests.
- **No placeholders:** every code step has full content; expected test numbers are pre-computed from the canonical formula.

```

```
