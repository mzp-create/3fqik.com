// Malay signed-price grading model (replaces the A3 even-money model).
// A line offers ONE side at a signed price p (−1.00…+1.00, stored ×100).
// Whole-number lines push (refund) on an exact result. See
// docs/superpowers/specs/2026-06-18-malay-pricing-model.md.
//
//   AH fav:  win margin>N · push margin=N · lose margin<N   (margin = effFav−effDog)
//   AH dog:  win margin<N · push margin=N · lose margin>N
//   OU over: win total>N  · push total=N  · lose total<N    (total = effFav+effDog)
//   OU under:win total<N  · push total=N  · lose total>N
//
//   WIN  → p>0: +p·S   p<0: +S
//   LOSE → p>0: −S     p<0: −|p|·S
//   PUSH → 0

export type GradeInput = {
  ballQ: number; // handicap / goals line ×4, integer 0–40
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

export type GradeDetail = {
  status: "won" | "push" | "lost";
  netMmk: number;
  market: "ah" | "ou";
  lineGoals: number; // N
  value: number; // margin (ah) or total (ou) — the integer compared to N
  result: "win" | "push" | "lose";
  priceC: number; // signed price ×100
};

function roundHalfAwayFromZero(x: number): number {
  return Math.sign(x) * Math.round(Math.abs(x)) || 0;
}

/** Shared computation kernel — validates input and computes full detail. */
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
  // Malay model: signed price, magnitude 1–100, never 0.
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

  const N = i.ballQ / 4; // line in goals

  // `value` is the integer we compare to the line; `beyond` is true when it
  // clears the line on the bet's winning side.
  let value: number;
  let beyond: boolean;
  if (i.market === "ah") {
    value = i.effFav - i.effDog; // margin
    beyond = i.side === "fav" ? value > N : value < N;
  } else {
    value = i.effFav + i.effDog; // total
    beyond = i.side === "over" ? value > N : value < N;
  }
  const onLine = value === N; // exact → push (only possible on whole lines)

  let result: "win" | "push" | "lose";
  let rawNet: number;
  if (onLine) {
    result = "push";
    rawNet = 0;
  } else if (beyond) {
    result = "win";
    // p>0 → +p·S ; p<0 → +S
    rawNet = i.priceC > 0 ? (i.priceC * i.stake) / 100 : i.stake;
  } else {
    result = "lose";
    // p>0 → −S ; p<0 → −|p|·S  (priceC<0 makes the product negative)
    rawNet = i.priceC > 0 ? -i.stake : (i.priceC * i.stake) / 100;
  }

  const netMmk = roundHalfAwayFromZero(rawNet);
  const status: "won" | "push" | "lost" =
    result === "push" ? "push" : result === "win" ? "won" : "lost";

  return {
    status,
    netMmk,
    market: i.market,
    lineGoals: N,
    value,
    result,
    priceC: i.priceC,
  };
}

export function gradeBet(i: GradeInput): GradeResult {
  const { status, netMmk } = compute(i);
  return { status, netMmk };
}

export function gradeDetail(i: GradeInput): GradeDetail {
  return compute(i);
}
