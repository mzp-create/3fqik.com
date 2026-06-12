export type GradeInput = {
  ballQ: number; // handicap or goals line ×4, integer ≥ 0
  priceC: number; // on-the-line payout ×100, integer 1–100 (positive only)
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

export type GradeKind =
  | "full_win"
  | "on_line_win"
  | "on_line_lose"
  | "partial_lose"
  | "full_lose";

export type GradeDetail = {
  status: "won" | "lost" | "push";
  netMmk: number;
  market: "ah" | "ou";
  lineGoals: number;
  d: number;
  kind: GradeKind;
  lossFraction: number | null; // min(|d|,1) when kind is partial_lose/full_lose, else null
};

function roundHalfAwayFromZero(x: number): number {
  // Use Math.sign to preserve direction; avoid -0 by || 0
  return Math.sign(x) * Math.round(Math.abs(x)) || 0;
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
    throw new Error("invalid ballQ: must be integer 0–40");
  // A3 model: priceC must be positive integer 1–100
  if (!Number.isInteger(i.priceC) || i.priceC < 1 || i.priceC > 100)
    throw new Error("invalid priceC: must be integer 1–100");
  if (!Number.isInteger(i.stake) || i.stake <= 0 || i.stake > 1_000_000_000)
    throw new Error("invalid stake: must be positive integer ≤ 1,000,000,000");
  if (
    !Number.isInteger(i.effFav) ||
    !Number.isInteger(i.effDog) ||
    i.effFav < 0 ||
    i.effDog < 0
  )
    throw new Error("invalid effective score: must be non-negative integers");

  const L = i.ballQ / 4; // line in goals

  // Distance d: how far the result lands on the bet's WINNING side of the line
  let d: number;
  if (i.market === "ah") {
    if (i.side === "fav") {
      d = i.effFav - i.effDog - L;
    } else {
      d = i.effDog - i.effFav + L;
    }
  } else {
    // ou
    if (i.side === "over") {
      d = i.effFav + i.effDog - L;
    } else {
      d = L - (i.effFav + i.effDog);
    }
  }

  // Compute raw net
  let rawNet: number;
  if (d > 0) {
    // Full win: +S
    rawNet = i.stake;
  } else if (d < 0) {
    // Partial or full loss: -min(|d|,1) × S
    rawNet = -Math.min(Math.abs(d), 1) * i.stake;
  } else {
    // d === 0: on-the-line price payout, sign by side/market/L
    // ah fav (L>0) → +pS
    // ah dog (L>0) → +pS
    // ah level (L==0) → -pS
    // ou over → -pS
    // ou under → +pS
    //
    // Compute magnitude as integer product then divide by 100 so that
    // X.5 results are represented exactly (up to 2^53) and
    // roundHalfAwayFromZero rounds them correctly.
    // e.g. priceC=69, stake=150 → 69*150=10350 → /100=103.5 → rounds to 104.
    const magnitude = (i.priceC * i.stake) / 100;
    if (i.market === "ah") {
      if (L > 0) {
        rawNet = magnitude; // win for both fav and dog when on a non-level line
      } else {
        rawNet = -magnitude; // loss on level (draw) line
      }
    } else {
      // ou
      if (i.side === "over") {
        rawNet = -magnitude; // over loses on the line
      } else {
        rawNet = magnitude; // under wins on the line
      }
    }
  }

  const netMmk = roundHalfAwayFromZero(rawNet);

  // Status from sign of net
  let status: "won" | "lost" | "push";
  if (netMmk > 0) status = "won";
  else if (netMmk < 0) status = "lost";
  else status = "push";

  // Kind classification
  let kind: GradeKind;
  let lossFraction: number | null;
  if (d > 0) {
    kind = "full_win";
    lossFraction = null;
  } else if (d === 0 && netMmk > 0) {
    kind = "on_line_win";
    lossFraction = null;
  } else if (d === 0 && netMmk < 0) {
    kind = "on_line_lose";
    lossFraction = null;
  } else if (d < 0 && Math.abs(d) < 1) {
    kind = "partial_lose";
    lossFraction = Math.abs(d);
  } else {
    // d < 0 && |d| >= 1  (or d==0 && net==0, which is push — classify as full_lose for consistency)
    kind = "full_lose";
    lossFraction = Math.min(Math.abs(d), 1);
  }

  return {
    status,
    netMmk,
    market: i.market,
    lineGoals: L,
    d,
    kind,
    lossFraction,
  };
}

export function gradeBet(i: GradeInput): GradeResult {
  const { status, netMmk } = compute(i);
  return { status, netMmk };
}

export function gradeDetail(i: GradeInput): GradeDetail {
  return compute(i);
}
