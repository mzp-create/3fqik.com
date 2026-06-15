import { and, eq, ne, isNotNull, sql } from "drizzle-orm";
import { schema, type Db } from "@/lib/db";
import { outstandingSettlements } from "./queries";

export async function dashboard(db: Db, today: string) {
  const graded = and(
    ne(schema.bets.status, "void"),
    isNotNull(schema.bets.netMmk),
  );
  const sumNet =
    sql<number>`coalesce(sum(${schema.bets.netMmk} + coalesce(${schema.bets.feeMmk}, 0)), 0)`.mapWith(
      Number,
    );

  const [tournamentRow] = await db
    .select({ s: sumNet })
    .from(schema.bets)
    .where(graded);
  const tournament = tournamentRow.s;

  const [todayNetRow] = await db
    .select({ s: sumNet })
    .from(schema.bets)
    .innerJoin(schema.matches, eq(schema.bets.matchId, schema.matches.id))
    .where(and(graded, eq(schema.matches.matchDay, today)));
  const todayNet = todayNetRow.s;

  const [todayBets] = await db
    .select({
      volume: sql<number>`coalesce(sum(${schema.bets.stakeMmk}), 0)`.mapWith(
        Number,
      ),
      count: sql<number>`count(*)`.mapWith(Number),
      players: sql<number>`count(distinct ${schema.bets.playerId})`.mapWith(
        Number,
      ),
    })
    .from(schema.bets)
    .innerJoin(schema.matches, eq(schema.bets.matchId, schema.matches.id))
    .where(
      and(ne(schema.bets.status, "void"), eq(schema.matches.matchDay, today)),
    );

  const matches = await db
    .select({
      matchId: schema.bets.matchId,
      stakeVolume:
        sql<number>`coalesce(sum(${schema.bets.stakeMmk}), 0)`.mapWith(Number),
      betCount: sql<number>`count(*)`.mapWith(Number),
    })
    .from(schema.bets)
    .innerJoin(schema.matches, eq(schema.bets.matchId, schema.matches.id))
    .where(
      and(ne(schema.bets.status, "void"), eq(schema.matches.matchDay, today)),
    )
    .groupBy(schema.bets.matchId);

  const outstanding = await outstandingSettlements(db);

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
