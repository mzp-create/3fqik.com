import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requirePlayer } from "@/lib/auth/session";
import { placeBet, MAX_STAKE, MIN_STAKE } from "@/lib/bets/place";
import { ticketUrl } from "@/lib/ticket/sign";
import { ok, fail, handle } from "@/lib/api";
import { nowIso } from "@/lib/time";

export async function POST(req: Request) {
  return handle(async () => {
    const me = await requirePlayer();
    const body = await req.json();
    if (typeof body !== "object" || body === null)
      return fail("bad_request", "invalid body");

    // Body validation: matchId integer, market 'ah'|'ou', lineVersion integer,
    // side widened to fav/dog/over/under (pairing validated in placeBet), stakeMmk integer
    const { matchId, market, lineVersion, side, stakeMmk } = body;
    if (!Number.isInteger(matchId) || matchId <= 0)
      return fail("bad_request", "matchId must be a positive integer");
    if (market !== "ah" && market !== "ou")
      return fail("bad_request", 'market must be "ah" or "ou"');
    if (!Number.isInteger(lineVersion) || lineVersion <= 0)
      return fail("bad_request", "lineVersion must be a positive integer");
    const validSides = new Set(["fav", "dog", "over", "under"]);
    if (!validSides.has(side))
      return fail(
        "bad_request",
        'side must be "fav", "dog", "over", or "under"',
      );
    if (
      !Number.isInteger(stakeMmk) ||
      stakeMmk < MIN_STAKE ||
      stakeMmk > MAX_STAKE
    )
      return fail(
        "bad_request",
        `stakeMmk must be between ${MIN_STAKE} and ${MAX_STAKE}`,
      );

    const bet = await placeBet(
      getDb(),
      me.id,
      { matchId, market, lineVersion, side, stakeMmk },
      nowIso(),
    );
    return ok({ ...bet, qrUrl: ticketUrl(bet.ticketNo) });
  });
}

export async function GET() {
  return handle(async () => {
    const me = await requirePlayer();
    const db = getDb();

    // Join bets → lines → matches to provide rich row context for Task 22's UI needs.
    // Returns each bet with: match {homeTeam, awayTeam, stage}, line {favSide, ballQ, priceC, market},
    // playerName (from session player's displayName), and qrUrl.
    const rows = await db
      .select({
        id: schema.bets.id,
        ticketNo: schema.bets.ticketNo,
        playerId: schema.bets.playerId,
        matchId: schema.bets.matchId,
        lineId: schema.bets.lineId,
        side: schema.bets.side,
        stakeMmk: schema.bets.stakeMmk,
        scoreHomeAtBet: schema.bets.scoreHomeAtBet,
        scoreAwayAtBet: schema.bets.scoreAwayAtBet,
        placedAt: schema.bets.placedAt,
        status: schema.bets.status,
        netMmk: schema.bets.netMmk,
        feeMmk: schema.bets.feeMmk,
        settledAt: schema.bets.settledAt,
        settlementId: schema.bets.settlementId,
        voidedBy: schema.bets.voidedBy,
        voidReason: schema.bets.voidReason,
        match: {
          homeTeam: schema.matches.homeTeam,
          awayTeam: schema.matches.awayTeam,
          stage: schema.matches.stage,
        },
        line: {
          favSide: schema.lines.favSide,
          ballQ: schema.lines.ballQ,
          priceC: schema.lines.priceC,
          market: schema.lines.market,
        },
      })
      .from(schema.bets)
      .innerJoin(schema.matches, eq(schema.bets.matchId, schema.matches.id))
      .innerJoin(schema.lines, eq(schema.bets.lineId, schema.lines.id))
      .where(eq(schema.bets.playerId, me.id))
      .orderBy(desc(schema.bets.placedAt), desc(schema.bets.id));

    return ok(
      rows.map((row) => ({
        ...row,
        playerName: me.displayName,
        qrUrl: ticketUrl(row.ticketNo),
      })),
    );
  });
}
