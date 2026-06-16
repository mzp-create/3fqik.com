import { eq } from "drizzle-orm";
import { schema, type Db } from "@/lib/db";
import { latestLine } from "@/lib/lines/manage";

function err(message: string, httpStatus = 400, code = "error") {
  return Object.assign(new Error(message), { httpStatus, code });
}

/**
 * Player-initiated self-cancel of their own bet, allowed only while the bet is
 * still "the same bet" it was when placed — protecting the bank from free
 * optionality. All guards must hold:
 *   - the ticket belongs to this player,
 *   - it is still pending and unsettled,
 *   - the match has not kicked off (status 'scheduled'),
 *   - the line has not moved (still the latest line for that match+market),
 *   - it is within the cancel window (seconds since placedAt).
 * On success the bet is voided (excluded from accounting) and audit-logged.
 * Anything outside these bounds throws — the player must ask the banker to void.
 */
export async function cancelOwnBet(
  db: Db,
  playerId: number,
  ticketNo: string,
  at: string,
  windowSeconds: number,
) {
  return db.transaction(async (tx) => {
    const [bet] = await tx
      .select()
      .from(schema.bets)
      .where(eq(schema.bets.ticketNo, ticketNo));
    if (!bet) throw err("ticket not found", 404, "not_found");
    if (bet.playerId !== playerId)
      throw err("not your ticket", 403, "forbidden");
    if (bet.status !== "pending" || bet.settlementId != null)
      throw err("this bet can no longer be cancelled", 409, "not_cancellable");

    if (windowSeconds <= 0)
      throw err("self-cancel is disabled", 409, "window_passed");
    const ageSec = (Date.parse(at) - Date.parse(bet.placedAt)) / 1000;
    if (!(ageSec >= 0 && ageSec <= windowSeconds))
      throw err(
        "cancellation window has passed — ask the banker to void it",
        409,
        "window_passed",
      );

    const [match] = await tx
      .select()
      .from(schema.matches)
      .where(eq(schema.matches.id, bet.matchId));
    if (!match) throw err("match not found", 404, "not_found");
    if (match.status !== "scheduled")
      throw err(
        "match has started — ask the banker to void it",
        409,
        "match_started",
      );

    const [line] = await tx
      .select()
      .from(schema.lines)
      .where(eq(schema.lines.id, bet.lineId));
    const current = await latestLine(
      tx as unknown as Db,
      bet.matchId,
      line.market,
    );
    if (!current || current.id !== bet.lineId)
      throw err(
        "the line has moved — ask the banker to void it",
        409,
        "line_moved",
      );

    await tx
      .update(schema.bets)
      .set({
        status: "void",
        netMmk: null,
        voidedBy: playerId,
        voidReason: "cancelled by player within window",
      })
      .where(eq(schema.bets.id, bet.id));
    await tx.insert(schema.auditLog).values({
      actorId: playerId,
      action: "cancel",
      subject: `ticket:${ticketNo}`,
      detail: `self-cancel within ${windowSeconds}s window`,
      at,
    });
    return { ticketNo, status: "void" as const };
  });
}
