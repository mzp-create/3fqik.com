import { and, eq, isNotNull, ne } from "drizzle-orm";
import { schema, type Db } from "@/lib/db";
import { gradeBet, type GradeInput } from "@/lib/engine/grade";
import { computeFee } from "@/lib/fees";
import { sseHub } from "@/lib/sse";

function err(message: string, httpStatus = 400, code = "error") {
  return Object.assign(new Error(message), { httpStatus, code });
}

/**
 * Grade all non-void pending tickets for a match given its confirmed final score.
 *
 * For live bets the effective score is (final − at-bet); Math.max(eff, 0) clamps
 * any VAR-reversal negative effective score to zero as documented.
 * Clamping is symmetric within a (line, at-bet-score) cohort — fav and dog bettors
 * of the same cohort always get mirrored outcomes; only cross-cohort asymmetry
 * exists, which the house absorbs.
 *
 * INVARIANT: placeBet caps stakes at MAX_STAKE (1e9) and gradeBet also validates ≤ 1e9,
 * so grading can never throw on stake size. We do NOT add defensive wrapping here;
 * if gradeBet throws (e.g. corrupted data) the transaction rolls back cleanly.
 */
function gradeMatchTickets(
  tx: Db,
  matchId: number,
  home: number,
  away: number,
  at: string,
) {
  // Read fee rates from settings (row id=1 always exists; defaults 3/2 apply)
  const settings = tx
    .select({
      commissionPct: schema.settings.commissionPct,
      discountPct: schema.settings.discountPct,
    })
    .from(schema.settings)
    .where(eq(schema.settings.id, 1))
    .get() ?? { commissionPct: 3, discountPct: 2 };

  const lines = new Map(
    tx
      .select()
      .from(schema.lines)
      .where(eq(schema.lines.matchId, matchId))
      .all()
      .map((l) => [l.id, l]),
  );
  const tickets = tx
    .select()
    .from(schema.bets)
    .where(
      and(eq(schema.bets.matchId, matchId), ne(schema.bets.status, "void")),
    )
    .all();
  for (const t of tickets) {
    const line = lines.get(t.lineId);
    if (!line) throw err("bet/line match mismatch", 500, "data_integrity");
    const effHome = home - t.scoreHomeAtBet;
    const effAway = away - t.scoreAwayAtBet;
    const effFav = line.favSide === "home" ? effHome : effAway;
    const effDog = line.favSide === "home" ? effAway : effHome;
    // Clamp to 0: a live bet placed when the score was higher than the final
    // (e.g. after VAR reversal) would produce a negative effective score.
    // The documented behavior is to treat it as 0 (no goals on that side since bet).
    // Clamping is symmetric within a (line, at-bet-score) cohort — fav and dog bettors
    // of the same cohort always get mirrored outcomes; only cross-cohort asymmetry
    // exists, which the house absorbs.
    // DB rows are untyped strings at runtime; market+side pairing is validated
    // inside gradeBet itself, so this cast is safe — any mismatch throws before use.
    const r = gradeBet({
      market: line.market,
      side: t.side,
      ballQ: line.ballQ,
      priceC: line.priceC,
      stake: t.stakeMmk,
      effFav: Math.max(effFav, 0),
      effDog: Math.max(effDog, 0),
    } as GradeInput);
    const fee = computeFee(
      r.netMmk,
      settings.commissionPct,
      settings.discountPct,
    );
    tx.update(schema.bets)
      .set({ status: r.status, netMmk: r.netMmk, feeMmk: fee, settledAt: at })
      .where(eq(schema.bets.id, t.id))
      .run();
  }
}

/**
 * Close the match day if every match on that day is now finished.
 * Idempotent: will not re-close an already-closed or settled day.
 * Returns true if the day transitioned to 'closed' in this call, false otherwise.
 */
function maybeCloseDay(tx: Db, matchDay: string, at: string): boolean {
  const unfinished = tx
    .select()
    .from(schema.matches)
    .where(
      and(
        eq(schema.matches.matchDay, matchDay),
        ne(schema.matches.status, "finished"),
      ),
    )
    .all();
  if (unfinished.length > 0) return false;
  let day = tx
    .select()
    .from(schema.matchDays)
    .where(eq(schema.matchDays.date, matchDay))
    .get();
  if (!day)
    day = tx
      .insert(schema.matchDays)
      .values({ date: matchDay })
      .returning()
      .get();
  if (day.status === "open") {
    tx.update(schema.matchDays)
      .set({ status: "closed", closedAt: at })
      .where(eq(schema.matchDays.id, day.id))
      .run();
    return true;
  }
  return false;
}

/**
 * Confirm the final score for a match, grade all pending tickets, and close the
 * match day if this was the last unfinished match.
 *
 * err codes:
 *   bad_score        — non-integer or out-of-range (0–99) score
 *   not_found        — match does not exist
 *   already_finished — match is already finished; use correctScore instead
 *
 * SSE broadcasts fire after the transaction commits:
 *   'match_final'  — always
 *   'day_closed'   — only when this call transitions the day to closed
 */
export function confirmFinalScore(
  db: Db,
  adminId: number,
  matchId: number,
  home: number,
  away: number,
  at: string,
) {
  if (
    !Number.isInteger(home) ||
    !Number.isInteger(away) ||
    home < 0 ||
    away < 0 ||
    home > 99 ||
    away > 99
  ) {
    throw err("invalid score: must be integers in 0–99", 400, "bad_score");
  }
  let dayClosed = false;
  let matchDay = "";
  db.transaction((tx) => {
    const m = tx
      .select()
      .from(schema.matches)
      .where(eq(schema.matches.id, matchId))
      .get();
    if (!m) throw err("match not found", 404, "not_found");
    if (m.status === "finished")
      throw err(
        "match already finished — use score correction",
        400,
        "already_finished",
      );
    matchDay = m.matchDay;
    tx.update(schema.matches)
      .set({
        status: "finished",
        homeScore: home,
        awayScore: away,
        scoreConfirmedAt: at,
      })
      .where(eq(schema.matches.id, matchId))
      .run();
    // Close any open or suspended lines
    const openLines = tx
      .select()
      .from(schema.lines)
      .where(
        and(
          eq(schema.lines.matchId, matchId),
          ne(schema.lines.status, "closed"),
        ),
      )
      .all();
    for (const l of openLines)
      tx.update(schema.lines)
        .set({ status: "closed" })
        .where(eq(schema.lines.id, l.id))
        .run();
    gradeMatchTickets(tx as unknown as Db, matchId, home, away, at);
    dayClosed = maybeCloseDay(tx as unknown as Db, m.matchDay, at);
    tx.insert(schema.auditLog)
      .values({
        actorId: adminId,
        action: "final_score",
        subject: `match:${matchId}`,
        detail: `${home}-${away}`,
        at,
      })
      .run();
  });
  // Broadcast outside the transaction (consistent with postLine convention)
  sseHub.broadcast("match_final", {
    matchId,
    homeScore: home,
    awayScore: away,
  });
  if (dayClosed) {
    sseHub.broadcast("day_closed", { date: matchDay });
  }
}

/**
 * Correct a previously confirmed final score and re-grade all non-void tickets.
 *
 * Blocked once the match day is settled (admin must reverse settlement first).
 * Also blocked if any non-void ticket on this match has already been paid out
 * (settlementId IS NOT NULL) — correction is unsafe until Task 17 lands.
 *
 * err codes:
 *   bad_score       — invalid score values
 *   not_finished    — match is not finished (use confirmFinalScore)
 *   day_settled     — match day is already settled; correction is blocked
 *   tickets_settled — one or more tickets have been paid out; correction is blocked
 *
 * SSE broadcast ('match_final') fires after the transaction commits.
 */
export function correctScore(
  db: Db,
  adminId: number,
  matchId: number,
  home: number,
  away: number,
  at: string,
) {
  if (
    !Number.isInteger(home) ||
    !Number.isInteger(away) ||
    home < 0 ||
    away < 0 ||
    home > 99 ||
    away > 99
  ) {
    throw err("invalid score: must be integers in 0–99", 400, "bad_score");
  }
  db.transaction((tx) => {
    const m = tx
      .select()
      .from(schema.matches)
      .where(eq(schema.matches.id, matchId))
      .get();
    if (!m || m.status !== "finished")
      throw err("match is not finished", 400, "not_finished");
    const day = tx
      .select()
      .from(schema.matchDays)
      .where(eq(schema.matchDays.date, m.matchDay))
      .get();
    if (day?.status === "settled")
      throw err(
        "match day already settled — correction blocked",
        400,
        "day_settled",
      );
    // Reject if any non-void ticket on this match has already been paid out.
    // This closes the partial-payout window before Task 17 lands.
    const paidTickets = tx
      .select()
      .from(schema.bets)
      .where(
        and(
          eq(schema.bets.matchId, matchId),
          ne(schema.bets.status, "void"),
          isNotNull(schema.bets.settlementId),
        ),
      )
      .all();
    if (paidTickets.length > 0)
      throw err(
        "tickets already settled — correction blocked",
        409,
        "tickets_settled",
      );
    tx.update(schema.matches)
      .set({ homeScore: home, awayScore: away })
      .where(eq(schema.matches.id, matchId))
      .run();
    gradeMatchTickets(tx as unknown as Db, matchId, home, away, at);
    tx.insert(schema.auditLog)
      .values({
        actorId: adminId,
        action: "score_correction",
        subject: `match:${matchId}`,
        detail: `${home}-${away}`,
        at,
      })
      .run();
  });
  // Broadcast outside the transaction (consistent with postLine convention)
  sseHub.broadcast("match_final", {
    matchId,
    homeScore: home,
    awayScore: away,
  });
}
