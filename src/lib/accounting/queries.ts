import { and, eq, isNotNull, ne, sql } from "drizzle-orm";
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
      settlementId: schema.bets.settlementId,
      favSide: schema.lines.favSide,
      ballQ: schema.lines.ballQ,
      priceC: schema.lines.priceC,
      market: schema.lines.market,
      homeTeam: schema.matches.homeTeam,
      awayTeam: schema.matches.awayTeam,
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
      netMmk: sql<number>`coalesce(sum(${schema.bets.netMmk}), 0)`,
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
  const houseNet = -rows.reduce((s, r) => s + r.netMmk, 0);
  return { day, rows, houseNet };
}
