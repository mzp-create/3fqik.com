/**
 * Regrade all non-void, non-settled bets on finished matches to the A3 model.
 *
 * Safe to run multiple times: only touches bets with settlementId IS NULL.
 * Skips any bet whose line has priceC < 1 (legacy negative-Malay lines).
 *
 * Usage:
 *   npm run db:regrade
 */

import { and, eq, isNull, ne } from "drizzle-orm";
import { getDb, schema } from "../src/lib/db/index";
import { gradeBet, type GradeInput } from "../src/lib/engine/grade";

const db = getDb();

// Fetch all finished matches
const finishedMatches = db
  .select()
  .from(schema.matches)
  .where(eq(schema.matches.status, "finished"))
  .all();

console.log(`Found ${finishedMatches.length} finished match(es).`);

let regraded = 0;
let skipped = 0;

for (const match of finishedMatches) {
  const finalHome = match.homeScore!;
  const finalAway = match.awayScore!;

  // Load all lines for this match keyed by id
  const lines = new Map(
    db
      .select()
      .from(schema.lines)
      .where(eq(schema.lines.matchId, match.id))
      .all()
      .map((l) => [l.id, l]),
  );

  // Load non-void, non-settled bets for this match
  const bets = db
    .select()
    .from(schema.bets)
    .where(
      and(
        eq(schema.bets.matchId, match.id),
        ne(schema.bets.status, "void"),
        isNull(schema.bets.settlementId),
      ),
    )
    .all();

  for (const bet of bets) {
    const line = lines.get(bet.lineId);
    if (!line) {
      console.warn(
        `SKIP bet ${bet.ticketNo}: line ${bet.lineId} not found for match ${match.id}`,
      );
      skipped++;
      continue;
    }

    // Skip legacy negative-Malay lines
    if (line.priceC < 1) {
      console.warn(
        `SKIP bet ${bet.ticketNo}: line priceC=${line.priceC} is a legacy negative-Malay line`,
      );
      skipped++;
      continue;
    }

    // Compute effective scores (clamped to 0 for VAR-reversal safety)
    const effHome = Math.max(finalHome - bet.scoreHomeAtBet, 0);
    const effAway = Math.max(finalAway - bet.scoreAwayAtBet, 0);
    const effFav = line.favSide === "home" ? effHome : effAway;
    const effDog = line.favSide === "home" ? effAway : effHome;

    const r = gradeBet({
      market: line.market,
      side: bet.side,
      ballQ: line.ballQ,
      priceC: line.priceC,
      stake: bet.stakeMmk,
      effFav,
      effDog,
    } as GradeInput);

    db.update(schema.bets)
      .set({ status: r.status, netMmk: r.netMmk })
      .where(eq(schema.bets.id, bet.id))
      .run();

    regraded++;
  }
}

console.log(`Done. Regraded: ${regraded} bet(s), skipped: ${skipped} bet(s).`);
