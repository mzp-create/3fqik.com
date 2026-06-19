import { and, eq, desc } from "drizzle-orm";
import { schema, type Db } from "@/lib/db";
import { sseHub } from "@/lib/sse";

function err(message: string, httpStatus = 400, code = "error") {
  return Object.assign(new Error(message), { httpStatus, code });
}

/** Returns the latest active line for a (match, market), or null if none. */
export async function activeLine(db: Db, matchId: number, market: "ah" | "ou") {
  const [latest] = await db
    .select()
    .from(schema.lines)
    .where(
      and(eq(schema.lines.matchId, matchId), eq(schema.lines.market, market)),
    )
    .orderBy(desc(schema.lines.version))
    .limit(1);
  return latest && latest.status === "active" ? latest : null;
}

/** Returns the latest line for a (match, market) (any status), or null if none. */
export async function latestLine(db: Db, matchId: number, market: "ah" | "ou") {
  const [latest] = await db
    .select()
    .from(schema.lines)
    .where(
      and(eq(schema.lines.matchId, matchId), eq(schema.lines.market, market)),
    )
    .orderBy(desc(schema.lines.version))
    .limit(1);
  return latest ?? null;
}

export async function postLine(
  db: Db,
  adminId: number,
  input: {
    matchId: number;
    market: "ah" | "ou";
    favSide: "home" | "away";
    ballQ: number;
    priceC: number; // primary side (fav/over)
    // Opposite side (dog/under). Defaults to priceC (symmetric) when omitted —
    // the admin UI always sends both; library/test/seed callers may omit it.
    priceOppC?: number;
  },
  at: string,
) {
  const priceOppC = input.priceOppC ?? input.priceC;
  // Validate inputs first (before entering the transaction)
  // ou market: ballQ must be ≥ 1 (no O 0.0 lines); ah keeps ≥ 0
  const minBallQ = input.market === "ou" ? 1 : 0;
  if (
    !Number.isInteger(input.ballQ) ||
    input.ballQ < minBallQ ||
    input.ballQ > 40
  )
    throw err(`invalid ball: must be integer ${minBallQ}–40`, 400, "bad_line");
  const priceOk = (p: number) =>
    Number.isInteger(p) && p !== 0 && p >= -100 && p <= 100;
  if (!priceOk(input.priceC) || !priceOk(priceOppC))
    throw err(
      "invalid price: signed integer in [−100,−1] ∪ [1,100]",
      400,
      "bad_line",
    );

  // Wrap close-prev + insert in a transaction to protect the read-modify-write
  // against the UNIQUE(matchId, market, version) constraint race.
  const line = await db.transaction(async (tx) => {
    const [match] = await tx
      .select()
      .from(schema.matches)
      .where(eq(schema.matches.id, input.matchId));
    if (!match) throw err("match not found", 404, "not_found");
    if (match.status === "finished")
      throw err("match is finished", 400, "match_finished");

    // Only look at lines for this market. Lock the latest row so a concurrent
    // post can't pick the same next version (UNIQUE guard backstops it anyway).
    const [prev] = await tx
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
      .for("update");

    if (prev && prev.status !== "closed")
      await tx
        .update(schema.lines)
        .set({ status: "closed" })
        .where(eq(schema.lines.id, prev.id));

    const [inserted] = await tx
      .insert(schema.lines)
      .values({
        matchId: input.matchId,
        market: input.market,
        version: (prev?.version ?? 0) + 1,
        favSide: input.favSide,
        // Vestigial: both sides are now offered. Kept to satisfy the NOT NULL
        // column; no longer read by placement/grading/display.
        offeredSide: input.market === "ah" ? "fav" : "over",
        ballQ: input.ballQ,
        priceC: input.priceC,
        priceOppC,
        status: "active",
        postedBy: adminId,
        postedAt: at,
      })
      .returning();
    return inserted;
  });

  sseHub.broadcast("line_update", {
    matchId: input.matchId,
    market: input.market,
    line,
  });
  return line;
}

export async function setLineStatus(
  db: Db,
  matchId: number,
  market: "ah" | "ou",
  status: "active" | "suspended" | "closed",
) {
  const latest = await latestLine(db, matchId, market);
  if (!latest) throw err("no line for this match", 404, "no_line");
  if (latest.status === "closed" && status !== "closed")
    throw err("line is closed and cannot be reopened", 400, "line_closed");
  await db
    .update(schema.lines)
    .set({ status })
    .where(eq(schema.lines.id, latest.id));
  const updated = { ...latest, status };
  sseHub.broadcast("line_update", { matchId, market, line: updated });
  return updated;
}
