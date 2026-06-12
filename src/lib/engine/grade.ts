export type GradeInput = {
  ballQ: number; // handicap or goals line ×4, integer ≥ 0
  priceC: number; // Malay price ×100, integer, −100 ≤ p ≤ 100, p ≠ 0
  stake: number; // MMK, integer > 0
  effFav: number; // favorite's (or home's) effective goals for this bet
  effDog: number; // dog's (or away's) effective goals for this bet
} & (
  | { market: "ah"; side: "fav" | "dog" }
  | { market: "ou"; side: "over" | "under" }
);

export type GradeResult = {
  status: "won" | "half_won" | "push" | "half_lost" | "lost";
  netMmk: number;
};

export type GradePart = { lineGoals: number; outcome: "win" | "push" | "lose" };

export type GradeDetail = {
  status: GradeResult["status"];
  netMmk: number;
  market: "ah" | "ou";
  effFav: number;
  effDog: number;
  quarter: boolean;
  parts: GradePart[];
};

type HalfOutcome = "win" | "push" | "lose";

/**
 * Outcome for one half-stake given the signed margin in quarter units.
 * margin > 0 → win, margin === 0 → push, margin < 0 → lose.
 * marginFn receives the half's ballQ and returns the signed margin.
 */
function halfOutcome(
  marginFn: (bq: number) => number,
  ballQ: number,
): HalfOutcome {
  const m = marginFn(ballQ);
  return m > 0 ? "win" : m === 0 ? "push" : "lose";
}

/** Exact (unrounded) net for a half-stake with Malay price. */
function halfNet(
  outcome: HalfOutcome,
  halfStake: number,
  priceC: number,
): number {
  if (outcome === "push") return 0;
  if (priceC > 0)
    return outcome === "win" ? (halfStake * priceC) / 100 : -halfStake;
  return outcome === "win" ? halfStake : -(halfStake * -priceC) / 100;
}

function roundHalfAwayFromZero(x: number): number {
  const r = Math.sign(x) * Math.round(Math.abs(x));
  return r === 0 ? 0 : r;
}

/** Shared computation kernel — validates input and computes full detail. */
function compute(i: GradeInput): GradeDetail {
  // Validate market first, then side pairing
  if (i.market !== "ah" && i.market !== "ou") throw new Error("invalid market");
  if (i.market === "ah") {
    if (i.side !== "fav" && i.side !== "dog")
      throw new Error("invalid side for market");
  } else {
    if (i.side !== "over" && i.side !== "under")
      throw new Error("invalid side for market");
  }

  if (!Number.isInteger(i.ballQ) || i.ballQ < 0 || i.ballQ > 40)
    throw new Error("invalid ballQ");
  if (
    !Number.isInteger(i.priceC) ||
    i.priceC === 0 ||
    i.priceC < -100 ||
    i.priceC > 100
  )
    throw new Error("invalid priceC");
  if (!Number.isInteger(i.stake) || i.stake <= 0 || i.stake > 1_000_000_000_000)
    throw new Error("invalid stake");
  if (
    !Number.isInteger(i.effFav) ||
    !Number.isInteger(i.effDog) ||
    i.effFav < 0 ||
    i.effDog < 0
  )
    throw new Error("invalid effective score");

  // Build marginFn: returns signed margin for a given ballQ in quarter units.
  // AH: diffQ = 4*(effFav - effDog); fav margin = diffQ - bq; dog margin = bq - diffQ
  // OU: totalQ = 4*(effFav + effDog); over margin = totalQ - bq; under margin = bq - totalQ
  let marginFn: (bq: number) => number;
  if (i.market === "ah") {
    const diffQ = 4 * (i.effFav - i.effDog);
    marginFn = i.side === "fav" ? (bq) => diffQ - bq : (bq) => bq - diffQ;
  } else {
    const totalQ = 4 * (i.effFav + i.effDog);
    marginFn = i.side === "over" ? (bq) => totalQ - bq : (bq) => bq - totalQ;
  }

  const quarter = i.ballQ % 2 === 1;
  const rawParts: Array<{ ballQ: number; stake: number }> = quarter
    ? [
        { ballQ: i.ballQ - 1, stake: i.stake / 2 },
        { ballQ: i.ballQ + 1, stake: i.stake / 2 },
      ]
    : [{ ballQ: i.ballQ, stake: i.stake }];

  const outcomes = rawParts.map((p) => halfOutcome(marginFn, p.ballQ));
  const exactNet = rawParts.reduce(
    (sum, p, k) => sum + halfNet(outcomes[k], p.stake, i.priceC),
    0,
  );
  const netMmk = roundHalfAwayFromZero(exactNet);

  const wins = outcomes.filter((o) => o === "win").length;
  const loses = outcomes.filter((o) => o === "lose").length;
  const n = outcomes.length;

  let status: GradeResult["status"];
  if (wins === n) status = "won";
  else if (loses === n) status = "lost";
  else if (wins > 0) status = "half_won";
  else if (loses > 0) status = "half_lost";
  else status = "push";

  const parts: GradePart[] = rawParts.map((p, k) => ({
    lineGoals: p.ballQ / 4,
    outcome: outcomes[k],
  }));

  return {
    status,
    netMmk,
    market: i.market,
    effFav: i.effFav,
    effDog: i.effDog,
    quarter,
    parts,
  };
}

export function gradeBet(i: GradeInput): GradeResult {
  const { status, netMmk } = compute(i);
  return { status, netMmk };
}

export function gradeDetail(i: GradeInput): GradeDetail {
  return compute(i);
}
