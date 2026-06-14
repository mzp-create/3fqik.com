import { and, eq, gte, lte, ne } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { ok, fail, handle } from "@/lib/api";

/** Returns 30-days-ago date as YYYY-MM-DD */
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
    const playerIdStr = sp.get("playerId");
    const from = sp.get("from") ?? defaultFrom();
    const to = sp.get("to") ?? todayStr();

    if (!playerIdStr || !/^\d+$/.test(playerIdStr))
      return fail("bad_request", "playerId (integer) required");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to))
      return fail("bad_request", "from/to must be YYYY-MM-DD");

    const playerId = parseInt(playerIdStr, 10);
    const db = getDb();

    // Get bets with match/line context for this player in date range
    const betRows = db
      .select({
        ticketNo: schema.bets.ticketNo,
        matchDay: schema.matches.matchDay,
        homeTeam: schema.matches.homeTeam,
        awayTeam: schema.matches.awayTeam,
        market: schema.lines.market,
        side: schema.bets.side,
        favSide: schema.lines.favSide,
        ballQ: schema.lines.ballQ,
        priceC: schema.lines.priceC,
        stakeMmk: schema.bets.stakeMmk,
        status: schema.bets.status,
        netMmk: schema.bets.netMmk,
        feeMmk: schema.bets.feeMmk,
        placedAt: schema.bets.placedAt,
        settlementId: schema.bets.settlementId,
        settlementRef: schema.settlements.ref,
      })
      .from(schema.bets)
      .innerJoin(schema.matches, eq(schema.bets.matchId, schema.matches.id))
      .innerJoin(schema.lines, eq(schema.bets.lineId, schema.lines.id))
      .leftJoin(
        schema.settlements,
        eq(schema.bets.settlementId, schema.settlements.id),
      )
      .where(
        and(
          eq(schema.bets.playerId, playerId),
          ne(schema.bets.status, "void"),
          gte(schema.matches.matchDay, from),
          lte(schema.matches.matchDay, to),
        ),
      )
      .orderBy(schema.bets.placedAt)
      .all();

    const bets = betRows.map((r) => {
      const grossNet = r.netMmk ?? 0;
      const fee = r.feeMmk ?? 0;
      return {
        ticketNo: r.ticketNo,
        matchDay: r.matchDay,
        homeTeam: r.homeTeam,
        awayTeam: r.awayTeam,
        market: r.market,
        side: r.side,
        favSide: r.favSide,
        ballQ: r.ballQ,
        priceC: r.priceC,
        stakeMmk: r.stakeMmk,
        status: r.status,
        grossNet,
        fee,
        net: grossNet + fee,
        placedAt: r.placedAt,
        settlementRef: r.settlementRef ?? null,
      };
    });

    // Get settlements for this player in date range
    const settlementRows = db
      .select({
        ref: schema.settlements.ref,
        matchDay: schema.matchDays.date,
        netMmk: schema.settlements.netMmk,
        markedAt: schema.settlements.markedAt,
        paymentMethod: schema.settlements.paymentMethod,
        paymentReference: schema.settlements.paymentReference,
        remark: schema.settlements.remark,
      })
      .from(schema.settlements)
      .innerJoin(
        schema.matchDays,
        eq(schema.settlements.matchDayId, schema.matchDays.id),
      )
      .where(
        and(
          eq(schema.settlements.playerId, playerId),
          gte(schema.matchDays.date, from),
          lte(schema.matchDays.date, to),
        ),
      )
      .orderBy(schema.settlements.markedAt)
      .all();

    // Summary — only graded tickets (netMmk not null)
    const gradedBets = bets.filter(
      (b) => b.grossNet !== 0 || b.status !== "pending",
    );
    const totalGross = gradedBets.reduce((s, b) => s + b.grossNet, 0);
    const totalFee = gradedBets.reduce((s, b) => s + b.fee, 0);
    const totalNet = gradedBets.reduce((s, b) => s + b.net, 0);
    const settledNet = settlementRows.reduce((s, r) => s + r.netMmk, 0);

    return ok({
      bets,
      settlements: settlementRows,
      summary: {
        totalGross,
        totalFee,
        totalNet,
        settledNet,
        unsettledNet: totalNet - settledNet,
      },
    });
  });
}
