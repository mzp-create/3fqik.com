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
    if (match.status === "finished")
      throw err("match finished", 400, "match_finished");

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

    const rest = {
      playerId,
      matchId: match.id,
      lineId: line.id,
      side: input.side,
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
