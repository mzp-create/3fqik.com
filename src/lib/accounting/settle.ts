import { eq } from "drizzle-orm";
import { schema, type Db } from "@/lib/db";
import { playerDayItems, dayBoard } from "./queries";

function err(message: string, httpStatus = 400, code = "error") {
  return Object.assign(new Error(message), { httpStatus, code });
}

/**
 * maybeSettleDay — module-private helper.
 *
 * If the day row exists, its status is 'closed', and every row on the
 * dayBoard has settled truthy, flip the day to 'settled'.
 *
 * Policy: an empty board on a closed day settles vacuously — there is
 * nothing to pay, so the day is considered fully settled.
 */
function maybeSettleDay(tx: Db, date: string): void {
  const day = tx
    .select()
    .from(schema.matchDays)
    .where(eq(schema.matchDays.date, date))
    .get();
  if (!day || day.status !== "closed") return;
  const { rows } = dayBoard(tx, date);
  const allSettled = rows.every((r) => r.settled);
  if (allSettled) {
    tx.update(schema.matchDays)
      .set({ status: "settled" })
      .where(eq(schema.matchDays.id, day.id))
      .run();
  }
}

export function markPlayerPaid(
  db: Db,
  adminId: number,
  date: string,
  playerId: number,
  at: string,
) {
  return db.transaction((tx) => {
    const txd = tx as unknown as Db;
    const day = tx
      .select()
      .from(schema.matchDays)
      .where(eq(schema.matchDays.date, date))
      .get();
    if (!day || day.status === "open")
      throw err("match day not closed yet", 400, "day_not_closed");
    const items = playerDayItems(txd, playerId, date);
    if (items.length === 0)
      throw err("no tickets for this player/day", 404, "not_found");
    if (items.some((i) => i.settlementId != null))
      throw err("already settled", 409, "already_settled");

    // single-process assumption: refs computed inside the synchronous txn; UNIQUE constraints are the multi-process backstop
    const count = tx
      .select()
      .from(schema.settlements)
      .where(eq(schema.settlements.matchDayId, day.id))
      .all().length;
    const mmdd = date.slice(5, 7) + date.slice(8, 10);
    const ref = `S-${mmdd}-${String(count + 1).padStart(2, "0")}`;
    const net = items.reduce(
      (s, i) => s + (i.netMmk ?? 0) + (i.feeMmk ?? 0),
      0,
    );

    const settlement = tx
      .insert(schema.settlements)
      .values({
        ref,
        matchDayId: day.id,
        playerId,
        netMmk: net,
        markedBy: adminId,
        markedAt: at,
      })
      .returning()
      .get();
    for (const i of items)
      tx.update(schema.bets)
        .set({ settlementId: settlement.id })
        .where(eq(schema.bets.id, i.id))
        .run();

    maybeSettleDay(txd, date);
    return settlement;
  });
}

export function voidTicket(
  db: Db,
  adminId: number,
  ticketNo: string,
  reason: string,
  at: string,
) {
  db.transaction((tx) => {
    const txd = tx as unknown as Db;
    const bet = tx
      .select()
      .from(schema.bets)
      .where(eq(schema.bets.ticketNo, ticketNo))
      .get();
    if (!bet) throw err("ticket not found", 404, "not_found");
    if (bet.settlementId != null)
      throw err("ticket already settled — cannot void", 409, "ticket_settled");
    tx.update(schema.bets)
      .set({
        status: "void",
        netMmk: null,
        voidedBy: adminId,
        voidReason: reason,
      })
      .where(eq(schema.bets.id, bet.id))
      .run();
    tx.insert(schema.auditLog)
      .values({
        actorId: adminId,
        action: "void",
        subject: `ticket:${ticketNo}`,
        detail: reason,
        at,
      })
      .run();
    // Resolve the match day for this ticket and check if the day should settle
    const match = tx
      .select()
      .from(schema.matches)
      .where(eq(schema.matches.id, bet.matchId))
      .get();
    if (match) {
      maybeSettleDay(txd, match.matchDay);
    }
  });
}
