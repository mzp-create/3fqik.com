import { and, eq, ne, isNotNull, sql } from "drizzle-orm";
import { schema, type Db } from "@/lib/db";
import { outstandingSettlements } from "./queries";

export function dashboard(db: Db, today: string) {
  const graded = and(
    ne(schema.bets.status, "void"),
    isNotNull(schema.bets.netMmk),
  );
  const sumNet = sql<number>`coalesce(sum(${schema.bets.netMmk}), 0)`;

  const tournament = db
    .select({ s: sumNet })
    .from(schema.bets)
    .where(graded)
    .get()!.s;

  const todayNet = db
    .select({ s: sumNet })
    .from(schema.bets)
    .innerJoin(schema.matches, eq(schema.bets.matchId, schema.matches.id))
    .where(and(graded, eq(schema.matches.matchDay, today)))
    .get()!.s;

  const todayBets = db
    .select({
      volume: sql<number>`coalesce(sum(${schema.bets.stakeMmk}), 0)`,
      count: sql<number>`count(*)`,
      players: sql<number>`count(distinct ${schema.bets.playerId})`,
    })
    .from(schema.bets)
    .innerJoin(schema.matches, eq(schema.bets.matchId, schema.matches.id))
    .where(
      and(ne(schema.bets.status, "void"), eq(schema.matches.matchDay, today)),
    )
    .get()!;

  const matches = db
    .select({
      matchId: schema.bets.matchId,
      stakeVolume: sql<number>`coalesce(sum(${schema.bets.stakeMmk}), 0)`,
      betCount: sql<number>`count(*)`,
    })
    .from(schema.bets)
    .innerJoin(schema.matches, eq(schema.bets.matchId, schema.matches.id))
    .where(
      and(ne(schema.bets.status, "void"), eq(schema.matches.matchDay, today)),
    )
    .groupBy(schema.bets.matchId)
    .all();

  const outstanding = outstandingSettlements(db);

  return {
    todayHouseNet: -todayNet,
    tournamentHouseNet: -tournament,
    todayStakeVolume: todayBets.volume,
    todayBetCount: todayBets.count,
    activePlayers: todayBets.players,
    matches,
    outstanding,
  };
}
