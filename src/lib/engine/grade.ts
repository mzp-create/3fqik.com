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

export type LegResult = "win" | "push" | "lose";

export type LegDetail = {
  lineGoals: number; // this leg's line N
  result: LegResult;
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
): LegResult {
  if (value === N) return "push";
  const beyond = side === "fav" || side === "over" ? value > N : value < N;
  return beyond ? "win" : "lose";
}

function legNetFor(
  result: LegResult,
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
  } else if (pushes === legs.length) {
    status = "push"; // every leg pushed
    result = "push";
  } else {
    // Unreachable: adjacent quarter legs differ by 0.5 vs an integer value, so a
    // win+lose mix can't occur. Fail loud rather than silently divergent.
    throw new Error("grade: inconsistent leg results (win+lose mix)");
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
