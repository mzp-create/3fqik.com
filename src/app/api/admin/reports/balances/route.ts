import { and, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { ok, handle } from "@/lib/api";

export async function GET() {
  return handle(async () => {
    await requireAdmin();
    const db = getDb();

    // Per-player unsettled graded non-void bets (effective net)
    const unsettledRows = await db
      .select({
        playerId: schema.bets.playerId,
        playerName: schema.players.displayName,
        unsettledNet:
          sql<number>`sum(${schema.bets.netMmk} + coalesce(${schema.bets.feeMmk}, 0))`.mapWith(
            Number,
          ),
      })
      .from(schema.bets)
      .innerJoin(
        schema.players,
        sql`${schema.bets.playerId} = ${schema.players.id}`,
      )
      .where(
        and(
          ne(schema.bets.status, "void"),
          isNotNull(schema.bets.netMmk),
          isNull(schema.bets.settlementId),
        ),
      )
      .groupBy(schema.bets.playerId, schema.players.displayName);

    // Per-player settled total (sum of settlements.net_mmk)
    const settledRows = await db
      .select({
        playerId: schema.settlements.playerId,
        settledNet: sql<number>`sum(${schema.settlements.netMmk})`.mapWith(
          Number,
        ),
      })
      .from(schema.settlements)
      .groupBy(schema.settlements.playerId);

    const settledMap = new Map<number, number>();
    for (const r of settledRows) {
      settledMap.set(r.playerId, r.settledNet ?? 0);
    }

    // Build combined rows keyed by playerId
    const rowMap = new Map<
      number,
      {
        playerId: number;
        playerName: string;
        unsettledNet: number;
        settledNet: number;
      }
    >();

    for (const r of unsettledRows) {
      rowMap.set(r.playerId, {
        playerId: r.playerId,
        playerName: r.playerName,
        unsettledNet: r.unsettledNet ?? 0,
        settledNet: settledMap.get(r.playerId) ?? 0,
      });
    }

    // Also include players with only settled history (no unsettled)
    for (const r of settledRows) {
      if (!rowMap.has(r.playerId)) {
        // Need the player name — fetch it
        const [player] = await db
          .select({ displayName: schema.players.displayName })
          .from(schema.players)
          .where(sql`${schema.players.id} = ${r.playerId}`);
        if (player) {
          rowMap.set(r.playerId, {
            playerId: r.playerId,
            playerName: player.displayName,
            unsettledNet: 0,
            settledNet: r.settledNet ?? 0,
          });
        }
      }
    }

    const rows = Array.from(rowMap.values()).sort((a, b) =>
      a.playerName.localeCompare(b.playerName),
    );

    let totalToPay = 0;
    let totalToCollect = 0;
    let totalSettled = 0;

    for (const r of rows) {
      if (r.unsettledNet > 0) totalToPay += r.unsettledNet;
      else if (r.unsettledNet < 0) totalToCollect += Math.abs(r.unsettledNet);
      totalSettled += r.settledNet;
    }

    return ok({
      rows,
      totals: {
        totalToPay,
        totalToCollect,
        totalSettled,
      },
    });
  });
}
