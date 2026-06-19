import { and, desc, eq, like, or, sql } from "drizzle-orm";
import { getDb, schema, type Db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { ok, fail, handle } from "@/lib/api";
import { recordBet } from "@/lib/bets/place";
import { nowIso } from "@/lib/time";

export type BetsFilter = {
  status?: string;
  q?: string;
};

type BetRow = {
  ticketNo: string;
  playerId: number;
  playerName: string;
  market: "ah" | "ou";
  side: "fav" | "dog" | "over" | "under";
  ballQ: number;
  priceC: number;
  stakeMmk: number;
  scoreHomeAtBet: number;
  scoreAwayAtBet: number;
  status: string;
  netMmk: number | null;
  feeMmk: number | null;
  settlementId: number | null;
  placedAt: string;
  favSide: "home" | "away";
  homeTeam: string;
  awayTeam: string;
  stage: string;
  matchStatus: string;
  finalHome: number | null;
  finalAway: number | null;
  voidedBy: string | null;
  voidReason: string | null;
  reconcileNote: string | null;
};

const CAP = 500;

export async function getAllBets(
  db: Db,
  filter: BetsFilter,
): Promise<{ rows: BetRow[]; capped: boolean }> {
  const VALID_STATUSES = [
    "pending",
    "won",
    "half_won",
    "push",
    "half_lost",
    "lost",
    "void",
  ] as const;
  type BetStatus = (typeof VALID_STATUSES)[number];

  const statusFilter =
    filter.status && filter.status !== "all"
      ? eq(schema.bets.status, filter.status as BetStatus)
      : undefined;

  const qLower = filter.q ? `%${filter.q.toLowerCase()}%` : undefined;
  const searchFilter = qLower
    ? or(
        like(sql`lower(${schema.bets.ticketNo})`, qLower),
        like(sql`lower(${schema.players.displayName})`, qLower),
        like(sql`lower(${schema.matches.homeTeam})`, qLower),
        like(sql`lower(${schema.matches.awayTeam})`, qLower),
      )
    : undefined;

  const whereClause =
    statusFilter && searchFilter
      ? and(statusFilter, searchFilter)
      : (statusFilter ?? searchFilter);

  const rows = await db
    .select({
      ticketNo: schema.bets.ticketNo,
      playerId: schema.bets.playerId,
      playerName: schema.players.displayName,
      market: schema.lines.market,
      side: schema.bets.side,
      ballQ: schema.lines.ballQ,
      // Bet's snapshot price (two-sided); fall back to the line for legacy rows.
      priceC:
        sql<number>`coalesce(${schema.bets.priceC}, ${schema.lines.priceC})`.mapWith(
          Number,
        ),
      stakeMmk: schema.bets.stakeMmk,
      scoreHomeAtBet: schema.bets.scoreHomeAtBet,
      scoreAwayAtBet: schema.bets.scoreAwayAtBet,
      status: schema.bets.status,
      netMmk: schema.bets.netMmk,
      feeMmk: schema.bets.feeMmk,
      settlementId: schema.bets.settlementId,
      placedAt: schema.bets.placedAt,
      favSide: schema.lines.favSide,
      homeTeam: schema.matches.homeTeam,
      awayTeam: schema.matches.awayTeam,
      stage: schema.matches.stage,
      matchStatus: schema.matches.status,
      finalHome: schema.matches.homeScore,
      finalAway: schema.matches.awayScore,
      voidedById: schema.bets.voidedBy,
      voidReason: schema.bets.voidReason,
      reconcileNote: schema.bets.reconcileNote,
    })
    .from(schema.bets)
    .innerJoin(schema.players, eq(schema.bets.playerId, schema.players.id))
    .innerJoin(schema.lines, eq(schema.bets.lineId, schema.lines.id))
    .innerJoin(schema.matches, eq(schema.bets.matchId, schema.matches.id))
    .where(whereClause)
    .orderBy(desc(schema.bets.placedAt))
    .limit(CAP + 1);

  const capped = rows.length > CAP;
  const limited = capped ? rows.slice(0, CAP) : rows;

  // Resolve voidedBy ID → display_name; batch-fetch unique IDs
  const voidedByIds = [
    ...new Set(
      limited.map((r) => r.voidedById).filter((id): id is number => id != null),
    ),
  ];
  const voiderMap = new Map<number, string>();
  for (const id of voidedByIds) {
    const [p] = await db
      .select({ displayName: schema.players.displayName })
      .from(schema.players)
      .where(eq(schema.players.id, id));
    if (p) voiderMap.set(id, p.displayName);
  }

  return {
    rows: limited.map(({ voidedById, ...rest }) => ({
      ...rest,
      voidedBy: voidedById != null ? (voiderMap.get(voidedById) ?? null) : null,
    })),
    capped,
  };
}

export async function GET(req: Request) {
  return handle(async () => {
    await requireAdmin();
    const sp = new URL(req.url).searchParams;
    const filter: BetsFilter = {
      status: sp.get("status") ?? undefined,
      q: sp.get("q") ?? undefined,
    };
    const db = getDb();
    const { rows, capped } = await getAllBets(db, filter);
    return ok({
      rows,
      capped,
      note: capped
        ? "Results capped at 500. Use filters to narrow down."
        : null,
    });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const admin = await requireAdmin();
    const body = await req.json();
    if (body.action !== "record") return fail("bad_request", "unknown action");
    const { playerId, matchId, market, side, stakeMmk } = body;
    if (!Number.isInteger(playerId))
      return fail("bad_request", "playerId required");
    if (!Number.isInteger(matchId))
      return fail("bad_request", "matchId required");
    if (market !== "ah" && market !== "ou")
      return fail("bad_request", "market must be ah|ou");
    const validSides = new Set(["fav", "dog", "over", "under"]);
    if (!validSides.has(side)) return fail("bad_request", "invalid side");
    if (!Number.isInteger(stakeMmk))
      return fail("bad_request", "stakeMmk required");
    const bet = await recordBet(
      getDb(),
      admin.id,
      { playerId, matchId, market, side, stakeMmk },
      nowIso(),
    );
    return ok(bet);
  });
}
