import { gradeDetail, type GradeInput } from "@/lib/engine/grade";
import { mmk, ball, priceSigned } from "@/lib/client/format";

export type BreakdownInput = {
  market: "ah" | "ou";
  side: "fav" | "dog" | "over" | "under";
  ballQ: number;
  priceC: number;
  stakeMmk: number;
  favSide: "home" | "away";
  homeTeam: string;
  awayTeam: string;
  scoreHomeAtBet: number;
  scoreAwayAtBet: number;
  finalHome: number;
  finalAway: number;
};

export type Breakdown = {
  scoreLine: string;
  mathLine: string;
  resultLine: string;
  result: "win" | "push" | "lose" | "half-win" | "half-lose";
  net: number;
};

/**
 * Human-readable settlement breakdown for one bet under the Malay model.
 * Returns null on bad data (gradeDetail throws). Shared by the admin bets and
 * settle boards so the explanation stays consistent.
 */
export function gradeBreakdown(b: BreakdownInput): Breakdown | null {
  try {
    const effHome = Math.max(b.finalHome - b.scoreHomeAtBet, 0);
    const effAway = Math.max(b.finalAway - b.scoreAwayAtBet, 0);
    const effFav = b.favSide === "home" ? effHome : effAway;
    const effDog = b.favSide === "home" ? effAway : effHome;

    const d = gradeDetail({
      market: b.market,
      side: b.side,
      ballQ: b.ballQ,
      priceC: b.priceC,
      stake: b.stakeMmk,
      effFav,
      effDog,
    } as GradeInput);

    const isLive = b.scoreHomeAtBet !== 0 || b.scoreAwayAtBet !== 0;
    const scoreLine = isLive
      ? `Bet at ${b.scoreHomeAtBet}–${b.scoreAwayAtBet} · final ${b.finalHome}–${b.finalAway} · counts after-bet goals ${effHome}–${effAway}`
      : `Final ${b.finalHome}–${b.finalAway}`;

    const fav = b.favSide === "home" ? b.homeTeam : b.awayTeam;
    const dog = b.favSide === "home" ? b.awayTeam : b.homeTeam;
    let mathLine: string;
    if (b.market === "ah") {
      const team = b.side === "fav" ? fav : dog;
      const sign = b.side === "fav" ? "−" : "+";
      mathLine = `${team} ${sign}${ball(b.ballQ)} @ ${priceSigned(b.priceC)} · margin ${d.value} vs ${d.lineGoals} → ${d.result}`;
    } else {
      const word = b.side === "over" ? "Over" : "Under";
      mathLine = `${word} ${ball(b.ballQ)} @ ${priceSigned(b.priceC)} · total ${d.value} vs ${d.lineGoals} → ${d.result}`;
    }

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
  } catch {
    return null;
  }
}
