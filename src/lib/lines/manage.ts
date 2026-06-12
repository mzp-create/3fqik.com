import { and, eq, desc } from "drizzle-orm";
import { schema, type Db } from "@/lib/db";
import { sseHub } from "@/lib/sse";

function err(message: string, httpStatus = 400, code = "error") {
  return Object.assign(new Error(message), { httpStatus, code });
}

/** Returns the latest active line for a (match, market), or null if none. */
export function activeLine(db: Db, matchId: number, market: "ah" | "ou") {
  const latest = db
    .select()
    .from(schema.lines)
    .where(
      and(eq(schema.lines.matchId, matchId), eq(schema.lines.market, market)),
    )
    .orderBy(desc(schema.lines.version))
    .limit(1)
    .get();
  return latest && latest.status === "active" ? latest : null;
}

/** Returns the latest line for a (match, market) (any status), or null if none. */
export function latestLine(db: Db, matchId: number, market: "ah" | "ou") {
  return (
    db
      .select()
      .from(schema.lines)
      .where(
        and(eq(schema.lines.matchId, matchId), eq(schema.lines.market, market)),
      )
      .orderBy(desc(schema.lines.version))
      .limit(1)
      .get() ?? null
  );
}

export function postLine(
  db: Db,
  adminId: number,
  input: {
    matchId: number;
    market: "ah" | "ou";
    favSide: "home" | "away";
    ballQ: number;
    priceC: number;
  },
  at: string,
) {
  // Validate inputs first (before entering the transaction)
  // ou market: ballQ must be ≥ 1 (no O 0.0 lines); ah keeps ≥ 0
  const minBallQ = input.market === "ou" ? 1 : 0;
  if (
    !Number.isInteger(input.ballQ) ||
    input.ballQ < minBallQ ||
    input.ballQ > 40
  )
    throw err(`invalid ball: must be integer ${minBallQ}–40`, 400, "bad_line");
  if (!Number.isInteger(input.priceC) || input.priceC < 1 || input.priceC > 100)
    throw err(
      "invalid price: must be positive integer in [1, 100]",
      400,
      "bad_line",
    );

  // Wrap close-prev + insert in a transaction to protect the read-modify-write
  // against the UNIQUE(matchId, market, version) constraint race.
  const line = db.transaction((tx) => {
    const match = tx
      .select()
      .from(schema.matches)
      .where(eq(schema.matches.id, input.matchId))
      .get();
    if (!match) throw err("match not found", 404, "not_found");
    if (match.status === "finished")
      throw err("match is finished", 400, "match_finished");

    // Only look at lines for this market
    const prev =
      tx
        .select()
        .from(schema.lines)
        .where(
          and(
            eq(schema.lines.matchId, input.matchId),
            eq(schema.lines.market, input.market),
          ),
        )
        .orderBy(desc(schema.lines.version))
        .limit(1)
        .get() ?? null;

    if (prev && prev.status !== "closed")
      tx.update(schema.lines)
        .set({ status: "closed" })
        .where(eq(schema.lines.id, prev.id))
        .run();

    return tx
      .insert(schema.lines)
      .values({
        matchId: input.matchId,
        market: input.market,
        version: (prev?.version ?? 0) + 1,
        favSide: input.favSide,
        ballQ: input.ballQ,
        priceC: input.priceC,
        status: "active",
        postedBy: adminId,
        postedAt: at,
      })
      .returning()
      .get();
  });

  sseHub.broadcast("line_update", {
    matchId: input.matchId,
    market: input.market,
    line,
  });
  return line;
}

export function setLineStatus(
  db: Db,
  matchId: number,
  market: "ah" | "ou",
  status: "active" | "suspended" | "closed",
) {
  // single-process assumption: synchronous better-sqlite3 means no interleaving
  const latest = latestLine(db, matchId, market);
  if (!latest) throw err("no line for this match", 404, "no_line");
  if (latest.status === "closed" && status !== "closed")
    throw err("line is closed and cannot be reopened", 400, "line_closed");
  db.update(schema.lines)
    .set({ status })
    .where(eq(schema.lines.id, latest.id))
    .run();
  const updated = { ...latest, status };
  sseHub.broadcast("line_update", { matchId, market, line: updated });
  return updated;
}
