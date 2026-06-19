import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { schema, type Db } from "@/lib/db";
import { latestLine } from "@/lib/lines/manage";
import { newTicketNo } from "@/lib/ticket/ticketNo";

export const MIN_STAKE = 10_000;
export const MAX_STAKE = 1_000_000_000;

// ATOMICITY: the whole read-check-write runs inside db.transaction(async tx).
// Postgres row locks (SELECT … FOR UPDATE) on the line and match-day rows serialize
// concurrent placements so the version check and stake-limit headroom can't race.

function err(
  message: string,
  httpStatus = 400,
  code = "error",
  extra?: Record<string, unknown>,
) {
  return Object.assign(new Error(message), { httpStatus, code, extra });
}

const fmt = (n: number) => n.toLocaleString("en-US");

export async function placeBet(
  db: Db,
  playerId: number,
  input: {
    matchId: number;
    market: "ah" | "ou";
    lineVersion: number;
    side: "fav" | "dog" | "over" | "under";
    stakeMmk: number;
  },
  at: string,
) {
  if (
    !Number.isInteger(input.stakeMmk) ||
    input.stakeMmk < MIN_STAKE ||
    input.stakeMmk > MAX_STAKE
  )
    throw err(
      `stake must be between ${fmt(MIN_STAKE)} and ${fmt(MAX_STAKE)} MMK`,
      400,
      "bad_stake",
    );

  // Validate side-market pairing: fav/dog ⇔ ah, over/under ⇔ ou
  const ahSides = new Set<string>(["fav", "dog"]);
  const ouSides = new Set<string>(["over", "under"]);
  if (input.market === "ah" && !ahSides.has(input.side))
    throw err("side must be 'fav' or 'dog' for ah market", 400, "bad_side");
  if (input.market === "ou" && !ouSides.has(input.side))
    throw err("side must be 'over' or 'under' for ou market", 400, "bad_side");

  return db.transaction(async (tx) => {
    const [match] = await tx
      .select()
      .from(schema.matches)
      .where(eq(schema.matches.id, input.matchId));
    if (!match) throw err("match not found", 404, "not_found");
    // GUARDRAIL: players may only bet on matches that have NOT started. A match
    // is "started" once it is marked live/finished OR its kickoff time has passed
    // (robust against an admin not yet flipping the status). Recording a bet on a
    // started/finished match is admin-only via recordBet().
    if (
      match.status !== "scheduled" ||
      Date.parse(at) >= Date.parse(match.kickoffUtc)
    )
      throw err(
        "betting is closed — the match has started",
        409,
        "betting_started",
      );

    // Version check against the specific market's latest line
    const line = await latestLine(
      tx as unknown as Db,
      input.matchId,
      input.market,
    );
    if (!line || line.status === "closed")
      throw err("betting closed for this match", 400, "betting_closed");
    if (line.status === "suspended")
      throw err("line suspended — updating", 400, "line_suspended");
    if (line.version !== input.lineVersion)
      throw err("line moved — confirm the new price", 409, "line_moved", {
        currentLine: line,
      });
    // Two-sided lines: resolve the chosen side's price. priceC is the primary
    // side (fav/over); priceOppC is the opposite side (dog/under). A side with
    // no price (legacy one-sided line) is not bettable.
    const priceC =
      input.side === "fav" || input.side === "over"
        ? line.priceC
        : line.priceOppC;
    if (priceC == null)
      throw err(
        "this side is not offered for this line",
        400,
        "side_not_offered",
      );

    // ensure match_day row exists and is open (cheaper check — correct precedence:
    // closed day → 'betting_closed' before limit errors). Lock the row so the
    // open→closed check and the limit headroom below see a consistent snapshot.
    let [day] = await tx
      .select()
      .from(schema.matchDays)
      .where(eq(schema.matchDays.date, match.matchDay))
      .for("update");
    if (!day)
      [day] = await tx
        .insert(schema.matchDays)
        .values({ date: match.matchDay })
        .returning();
    if (day.status !== "open")
      throw err("match day is closed for betting", 409, "betting_closed");

    // limits: carve-out vs daily pool (spec §8)
    // Limits span BOTH markets for a match — stakeOn sums by matchId regardless of market.
    const stakeOn = async (matchIds: number[]) =>
      matchIds.length === 0
        ? 0
        : (
            await tx
              .select({
                s: sql<number>`coalesce(sum(${schema.bets.stakeMmk}), 0)`.mapWith(
                  Number,
                ),
              })
              .from(schema.bets)
              .where(
                and(
                  inArray(schema.bets.matchId, matchIds),
                  ne(schema.bets.status, "void"),
                ),
              )
          )[0].s;

    if (match.betLimitMmk != null) {
      // carve-out match: uses its own cap, completely independent of the daily pool
      const head = match.betLimitMmk - (await stakeOn([match.id]));
      if (input.stakeMmk > head)
        throw err(
          `house can accept only ${fmt(Math.max(head, 0))} MMK more on this match`,
          409,
          "limit_reached",
          { headroomMmk: Math.max(head, 0) },
        );
    } else {
      // non-carve-out match: counts against the daily pool
      const [cfg] = await tx.select().from(schema.settings);
      const daily = cfg?.dailyTotalLimitMmk ?? 0;
      if (daily > 0) {
        // only non-carve-out matches on the same matchDay count toward the pool
        const poolMatches = (
          await tx
            .select({ id: schema.matches.id })
            .from(schema.matches)
            .where(
              and(
                eq(schema.matches.matchDay, match.matchDay),
                sql`${schema.matches.betLimitMmk} is null`,
              ),
            )
        ).map((r) => r.id);
        const head = daily - (await stakeOn(poolMatches));
        if (input.stakeMmk > head)
          throw err(
            `house can accept only ${fmt(Math.max(head, 0))} MMK more on this match day`,
            409,
            "limit_reached",
            { headroomMmk: Math.max(head, 0) },
          );
      }
    }

    // Per-user tier caps — standard only. Pro bypasses; house limits above
    // already applied to everyone. recordBet() does not run this block.
    const [bettor] = await tx
      .select({ tier: schema.players.tier })
      .from(schema.players)
      .where(eq(schema.players.id, playerId));
    if (bettor?.tier !== "pro") {
      const [cfg2] = await tx.select().from(schema.settings);
      const maxStake = cfg2?.stdMaxStakeMmk ?? 500_000;
      const maxOutstanding = cfg2?.stdOutstandingMmk ?? 1_000_000;
      const maxPerMatch = cfg2?.stdMaxBetsPerMatch ?? 2;
      if (input.stakeMmk > maxStake)
        throw err(
          `max ${fmt(maxStake)} MMK per bet for your account`,
          400,
          "tier_bet_limit",
          { maxMmk: maxStake },
        );
      const [pend] = await tx
        .select({
          s: sql<number>`coalesce(sum(${schema.bets.stakeMmk}), 0)`.mapWith(
            Number,
          ),
        })
        .from(schema.bets)
        .where(
          and(
            eq(schema.bets.playerId, playerId),
            eq(schema.bets.status, "pending"),
          ),
        );
      const remaining = maxOutstanding - pend.s;
      if (input.stakeMmk > remaining)
        throw err(
          `you can place only ${fmt(Math.max(remaining, 0))} MMK more in open bets`,
          409,
          "tier_outstanding_limit",
          { remainingMmk: Math.max(remaining, 0) },
        );
      const [cnt] = await tx
        .select({ c: sql<number>`count(*)`.mapWith(Number) })
        .from(schema.bets)
        .where(
          and(
            eq(schema.bets.playerId, playerId),
            eq(schema.bets.matchId, match.id),
            ne(schema.bets.status, "void"),
          ),
        );
      if (cnt.c >= maxPerMatch)
        throw err(
          `max ${maxPerMatch} bets per match for your account`,
          409,
          "tier_match_bets",
          { maxBets: maxPerMatch },
        );
    }

    const rest = {
      playerId,
      matchId: match.id,
      lineId: line.id,
      side: input.side,
      priceC, // snapshot the chosen side's price for grading & display
      stakeMmk: input.stakeMmk,
      scoreHomeAtBet: match.homeScore ?? 0,
      scoreAwayAtBet: match.awayScore ?? 0,
      placedAt: at,
    };
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const [inserted] = await tx
          .insert(schema.bets)
          .values({ ticketNo: newTicketNo(), ...rest })
          .returning();
        return inserted;
      } catch (e) {
        // Postgres unique_violation on ticket_no → regenerate and retry
        if (
          e &&
          typeof e === "object" &&
          "code" in e &&
          (e as { code?: string }).code === "23505" &&
          /ticket_no/.test(String((e as { detail?: string }).detail ?? ""))
        ) {
          lastErr = e;
          continue;
        }
        throw e;
      }
    }
    throw lastErr;
  });
}

/**
 * Admin-only: record a bet on behalf of a player, BYPASSING the started/finished,
 * line-status, day-closed, and stake-limit gates. This is the sanctioned path for
 * manually recording bets that were agreed in person (e.g. before kickoff, entered
 * late). Snapshots the chosen side's price from the latest line for the market
 * (any status). Score-at-bet defaults to 0–0 (treated as a pre-match bet) so
 * grading uses the full match unless the caller overrides it. Writes an audit row.
 */
export async function recordBet(
  db: Db,
  adminId: number,
  input: {
    playerId: number;
    matchId: number;
    market: "ah" | "ou";
    side: "fav" | "dog" | "over" | "under";
    stakeMmk: number;
    scoreHomeAtBet?: number;
    scoreAwayAtBet?: number;
  },
  at: string,
) {
  if (
    !Number.isInteger(input.stakeMmk) ||
    input.stakeMmk < MIN_STAKE ||
    input.stakeMmk > MAX_STAKE
  )
    throw err(
      `stake must be between ${fmt(MIN_STAKE)} and ${fmt(MAX_STAKE)} MMK`,
      400,
      "bad_stake",
    );
  const ahSides = new Set<string>(["fav", "dog"]);
  const ouSides = new Set<string>(["over", "under"]);
  if (input.market === "ah" && !ahSides.has(input.side))
    throw err("side must be 'fav' or 'dog' for ah market", 400, "bad_side");
  if (input.market === "ou" && !ouSides.has(input.side))
    throw err("side must be 'over' or 'under' for ou market", 400, "bad_side");

  return db.transaction(async (tx) => {
    const [match] = await tx
      .select()
      .from(schema.matches)
      .where(eq(schema.matches.id, input.matchId));
    if (!match) throw err("match not found", 404, "not_found");
    // Admin override: no started/finished/day/limit gate. Use the latest line for
    // the market (any status) to snapshot the chosen side's price.
    const line = await latestLine(
      tx as unknown as Db,
      input.matchId,
      input.market,
    );
    if (!line) throw err("no line posted for this market", 400, "no_line");
    const priceC =
      input.side === "fav" || input.side === "over"
        ? line.priceC
        : line.priceOppC;
    if (priceC == null)
      throw err(
        "this side is not offered for this line",
        400,
        "side_not_offered",
      );

    const rest = {
      playerId: input.playerId,
      matchId: match.id,
      lineId: line.id,
      side: input.side,
      priceC,
      stakeMmk: input.stakeMmk,
      scoreHomeAtBet: input.scoreHomeAtBet ?? 0,
      scoreAwayAtBet: input.scoreAwayAtBet ?? 0,
      placedAt: at,
    };
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const [inserted] = await tx
          .insert(schema.bets)
          .values({ ticketNo: newTicketNo(), ...rest })
          .returning();
        await tx.insert(schema.auditLog).values({
          actorId: adminId,
          action: "record_bet",
          subject: `bet:${inserted.ticketNo}`,
          detail: `player:${input.playerId} match:${match.id} ${input.market}/${input.side} stake:${input.stakeMmk} (match ${match.status})`,
          at,
        });
        return inserted;
      } catch (e) {
        if (
          e &&
          typeof e === "object" &&
          "code" in e &&
          (e as { code?: string }).code === "23505" &&
          /ticket_no/.test(String((e as { detail?: string }).detail ?? ""))
        ) {
          lastErr = e;
          continue;
        }
        throw e;
      }
    }
    throw lastErr;
  });
}
