import { and, gte, isNotNull, lte, min, ne, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { ok, fail, handle } from "@/lib/api";

function defaultFrom(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  return handle(async () => {
    await requireAdmin();
    const sp = new URL(req.url).searchParams;
    const from = sp.get("from") ?? defaultFrom();
    const to = sp.get("to") ?? todayStr();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to))
      return fail("bad_request", "from/to must be YYYY-MM-DD");

    const db = getDb();

    // Per (matchDay, player) over graded non-void bets
    const rows = await db
      .select({
        matchDay: schema.matches.matchDay,
        playerId: schema.bets.playerId,
        playerName: schema.players.displayName,
        net: sql<number>`sum(${schema.bets.netMmk} + coalesce(${schema.bets.feeMmk}, 0))`.mapWith(
          Number,
        ),
        ticketCount: sql<number>`count(*)`.mapWith(Number),
        // min(settlementId) is null means at least one ticket unsettled
        minSettlementId: min(schema.bets.settlementId),
        // Get ref from settlements (works because one settlement per player per day)
        ref: schema.settlements.ref,
        paymentMethod: schema.settlements.paymentMethod,
        paymentReference: schema.settlements.paymentReference,
        remark: schema.settlements.remark,
      })
      .from(schema.bets)
      .innerJoin(
        schema.matches,
        and(
          sql`${schema.bets.matchId} = ${schema.matches.id}`,
          gte(schema.matches.matchDay, from),
          lte(schema.matches.matchDay, to),
        ),
      )
      .innerJoin(
        schema.players,
        sql`${schema.bets.playerId} = ${schema.players.id}`,
      )
      .leftJoin(
        schema.settlements,
        and(
          sql`${schema.bets.playerId} = ${schema.settlements.playerId}`,
          sql`${schema.settlements.matchDayId} = (select id from match_days where date = ${schema.matches.matchDay})`,
        ),
      )
      .where(and(ne(schema.bets.status, "void"), isNotNull(schema.bets.netMmk)))
      // Postgres requires every non-aggregated selected column in GROUP BY.
      // displayName is functionally dependent on playerId, and there is exactly
      // one settlement per (player, matchDay), so grouping by the settlement
      // detail columns does not split groups.
      .groupBy(
        schema.matches.matchDay,
        schema.bets.playerId,
        schema.players.displayName,
        schema.settlements.ref,
        schema.settlements.paymentMethod,
        schema.settlements.paymentReference,
        schema.settlements.remark,
      )
      .orderBy(
        sql`${schema.matches.matchDay} desc`,
        schema.players.displayName,
      );

    const playerRows = rows.map((r) => ({
      matchDay: r.matchDay,
      playerId: r.playerId,
      playerName: r.playerName,
      net: r.net ?? 0,
      ticketCount: r.ticketCount,
      settled: r.minSettlementId != null,
      ref: r.ref ?? null,
      paymentMethod: r.paymentMethod ?? null,
      paymentReference: r.paymentReference ?? null,
      remark: r.remark ?? null,
    }));

    // Per-day house position
    const dayMap = new Map<string, number>();
    for (const r of playerRows) {
      dayMap.set(r.matchDay, (dayMap.get(r.matchDay) ?? 0) + r.net);
    }
    const dayTotals = Array.from(dayMap.entries()).map(
      ([matchDay, playerNetSum]) => ({
        matchDay,
        houseNet: -playerNetSum,
        playerNetSum,
      }),
    );

    // Grand totals
    const grandTotalNet = playerRows.reduce((s, r) => s + r.net, 0);
    const grandTotalTickets = playerRows.reduce((s, r) => s + r.ticketCount, 0);

    return ok({
      rows: playerRows,
      dayTotals,
      grandTotal: {
        net: grandTotalNet,
        houseNet: -grandTotalNet,
        ticketCount: grandTotalTickets,
      },
    });
  });
}
