import { and, gte, isNotNull, lte, ne, sql } from "drizzle-orm";
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

    // Graded non-void bets in date range with effective net
    const rows = db
      .select({
        stakeMmk: schema.bets.stakeMmk,
        netMmk: schema.bets.netMmk,
        feeMmk: schema.bets.feeMmk,
        playerId: schema.bets.playerId,
      })
      .from(schema.bets)
      .innerJoin(
        schema.matches,
        sql`${schema.bets.matchId} = ${schema.matches.id}`,
      )
      .where(
        and(
          ne(schema.bets.status, "void"),
          isNotNull(schema.bets.netMmk),
          gte(schema.matches.matchDay, from),
          lte(schema.matches.matchDay, to),
        ),
      )
      .all();

    let turnover = 0;
    let grossWin = 0;
    let grossLoss = 0;
    let commission = 0;
    let discount = 0;
    const playerIds = new Set<number>();

    for (const r of rows) {
      turnover += r.stakeMmk;
      const net = r.netMmk ?? 0;
      const fee = r.feeMmk ?? 0;
      const effNet = net + fee;

      if (effNet > 0) grossWin += effNet;
      else if (effNet < 0) grossLoss += effNet; // negative

      // Commission: fee_mmk < 0 (wins → commission deducted from player)
      if (fee < 0)
        commission += -fee; // store as positive
      // Discount: fee_mmk > 0 (losses → discount given to player)
      else if (fee > 0) discount += fee;

      playerIds.add(r.playerId);
    }

    const playerNet = grossWin + grossLoss; // grossLoss is negative
    const houseNet = -playerNet;

    return ok({
      turnover,
      grossWin,
      grossLoss,
      commission,
      discount,
      playerNet,
      houseNet,
      betCount: rows.length,
      players: playerIds.size,
    });
  });
}
