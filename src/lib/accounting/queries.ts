import { and, eq, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { schema, type Db } from "@/lib/db";

/** Graded, non-void tickets for a player on a match day, with line/match context. */
export function playerDayItems(db: Db, playerId: number, date: string) {
  return db
    .select({
      id: schema.bets.id,
      ticketNo: schema.bets.ticketNo,
      side: schema.bets.side,
      stakeMmk: schema.bets.stakeMmk,
      status: schema.bets.status,
      netMmk: schema.bets.netMmk,
      feeMmk: schema.bets.feeMmk,
      settlementId: schema.bets.settlementId,
      favSide: schema.lines.favSide,
      ballQ: schema.lines.ballQ,
      priceC: schema.lines.priceC,
      market: schema.lines.market,
      homeTeam: schema.matches.homeTeam,
      awayTeam: schema.matches.awayTeam,
      scoreHomeAtBet: schema.bets.scoreHomeAtBet,
      scoreAwayAtBet: schema.bets.scoreAwayAtBet,
      finalHomeScore: schema.matches.homeScore,
      finalAwayScore: schema.matches.awayScore,
    })
    .from(schema.bets)
    .innerJoin(schema.lines, eq(schema.bets.lineId, schema.lines.id))
    .innerJoin(schema.matches, eq(schema.bets.matchId, schema.matches.id))
    .where(
      and(
        eq(schema.bets.playerId, playerId),
        eq(schema.matches.matchDay, date),
        ne(schema.bets.status, "void"),
      ),
    )
    .all();
}

/** Per-player nets for a day (graded tickets only). */
export function dayBoard(db: Db, date: string) {
  const day = db
    .select()
    .from(schema.matchDays)
    .where(eq(schema.matchDays.date, date))
    .get() ?? {
    id: 0,
    date,
    status: "open" as const,
    closedAt: null,
  };
  const rows = db
    .select({
      playerId: schema.bets.playerId,
      displayName: schema.players.displayName,
      netMmk: sql<number>`coalesce(sum(${schema.bets.netMmk} + coalesce(${schema.bets.feeMmk}, 0)), 0)`,
      ticketCount: sql<number>`count(*)`,
      settled: sql<number>`min(${schema.bets.settlementId} is not null)`,
    })
    .from(schema.bets)
    .innerJoin(schema.matches, eq(schema.bets.matchId, schema.matches.id))
    .innerJoin(schema.players, eq(schema.bets.playerId, schema.players.id))
    .where(
      and(
        eq(schema.matches.matchDay, date),
        ne(schema.bets.status, "void"),
        isNotNull(schema.bets.netMmk),
      ),
    )
    .groupBy(schema.bets.playerId)
    .all();

  // Fetch settlement detail fields for settled players on this day
  const settlementDetails =
    day.id > 0
      ? db
          .select({
            playerId: schema.settlements.playerId,
            ref: schema.settlements.ref,
            paymentMethod: schema.settlements.paymentMethod,
            paymentReference: schema.settlements.paymentReference,
            remark: schema.settlements.remark,
          })
          .from(schema.settlements)
          .where(eq(schema.settlements.matchDayId, day.id))
          .all()
      : [];
  const settlementMap = new Map(settlementDetails.map((s) => [s.playerId, s]));

  const enrichedRows = rows.map((r) => {
    const s = settlementMap.get(r.playerId);
    return {
      ...r,
      ref: s?.ref ?? null,
      paymentMethod: s?.paymentMethod ?? null,
      paymentReference: s?.paymentReference ?? null,
      remark: s?.remark ?? null,
    };
  });

  const houseNet = -rows.reduce((s, r) => s + r.netMmk, 0);
  return { day, rows: enrichedRows, houseNet };
}

/** All-time outstanding settlement units: (playerId, matchDay) with unsettled graded non-void bets. */
export function outstandingSettlements(db: Db) {
  // Group bets by (playerId, matchDay) → compute net per unit
  const units = db
    .select({
      playerId: schema.bets.playerId,
      matchDay: schema.matches.matchDay,
      unitNet: sql<number>`sum(${schema.bets.netMmk} + coalesce(${schema.bets.feeMmk}, 0))`,
    })
    .from(schema.bets)
    .innerJoin(schema.matches, eq(schema.bets.matchId, schema.matches.id))
    .where(
      and(
        ne(schema.bets.status, "void"),
        isNotNull(schema.bets.netMmk),
        isNull(schema.bets.settlementId),
      ),
    )
    .groupBy(schema.bets.playerId, schema.matches.matchDay)
    .all();

  let toPayMmk = 0;
  let toCollectMmk = 0;
  let payCount = 0;
  let collectCount = 0;

  for (const u of units) {
    if (u.unitNet > 0) {
      toPayMmk += u.unitNet;
      payCount++;
    } else if (u.unitNet < 0) {
      toCollectMmk += Math.abs(u.unitNet);
      collectCount++;
    }
    // net == 0 (push): contributes to neither
  }

  return { toPayMmk, toCollectMmk, payCount, collectCount };
}
