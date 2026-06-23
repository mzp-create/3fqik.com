// Convert the chatbot's human-friendly betting units into the app's wire
// encoding (see CLAUDE.md "Money encoding"). Pure + tested — no I/O.
//
//   handicap / O-U goals  ×4  -> ballQ   (0.75 -> 3 ; O/U 2.5 -> 10)
//   Malay price           ×100 -> priceC (+0.92 -> 92 ; -0.98 -> -98)
//
// The opposite side mirrors as -priceC unless an explicit opposite price is
// given (the established two-sided convention).

/** goals (multiple of 0.25, 0–10) -> ballQ integer 0–40. Throws on a bad grid. */
export function encodeBall(goals: number, market: "ah" | "ou"): number {
  if (typeof goals !== "number" || !Number.isFinite(goals))
    throw new Error("handicap/goals must be a number");
  const q = Math.round(goals * 4);
  if (Math.abs(goals * 4 - q) > 1e-9)
    throw new Error(`line must be a multiple of 0.25 (got ${goals})`);
  const min = market === "ou" ? 1 : 0; // no O/U 0.0 line
  if (q < min || q > 40)
    throw new Error(
      market === "ou"
        ? `O/U goals must be 0.25–10 (got ${goals})`
        : `handicap must be 0–10 (got ${goals})`,
    );
  return q;
}

/** Malay price (−1.00…+1.00, not 0, steps of 0.01) -> signed priceC ×100. */
export function encodePrice(price: number): number {
  if (typeof price !== "number" || !Number.isFinite(price))
    throw new Error("price must be a number");
  const c = Math.round(price * 100);
  if (Math.abs(price * 100 - c) > 1e-9)
    throw new Error(`price must be a multiple of 0.01 (got ${price})`);
  if (c === 0) throw new Error("price cannot be 0");
  if (c < -100 || c > 100)
    throw new Error(`price must be between −1.00 and +1.00 (got ${price})`);
  return c;
}

/** Build the wire payload for a line `post` from human units. */
export function lineWire(input: {
  matchId: number;
  market: "ah" | "ou";
  favSide?: "home" | "away";
  handicapGoals: number;
  priceMalay: number;
  priceOppMalay?: number;
}): {
  matchId: number;
  market: "ah" | "ou";
  favSide?: "home" | "away";
  ballQ: number;
  priceC: number;
  priceOppC: number;
} {
  const priceC = encodePrice(input.priceMalay);
  const priceOppC =
    input.priceOppMalay != null ? encodePrice(input.priceOppMalay) : -priceC;
  if (
    input.market === "ah" &&
    input.favSide !== "home" &&
    input.favSide !== "away"
  )
    throw new Error("favSide must be 'home' or 'away' for an AH line");
  return {
    matchId: input.matchId,
    market: input.market,
    // O/U stores a dummy favSide ('home'); grading ignores it.
    favSide: input.market === "ou" ? "home" : input.favSide,
    ballQ: encodeBall(input.handicapGoals, input.market),
    priceC,
    priceOppC,
  };
}
