import { eq } from "drizzle-orm";
import { schema, type Db } from "@/lib/db";
import { sseHub } from "@/lib/sse";

function err(message: string, httpStatus = 400, code = "error") {
  return Object.assign(new Error(message), { httpStatus, code });
}

/**
 * Transition a scheduled match to live status, initialising the score to 0-0.
 *
 * Throws:
 *   not_found      — match does not exist
 *   match_finished — match is already finished (addition beyond plan spec)
 */
export function setMatchLive(db: Db, matchId: number) {
  const m = db
    .select()
    .from(schema.matches)
    .where(eq(schema.matches.id, matchId))
    .get();
  if (!m) throw err("match not found", 404, "not_found");
  if (m.status === "live") return; // idempotent: re-tap must not wipe the running score
  if (m.status === "finished")
    throw err(
      "match is finished — cannot set live again",
      400,
      "match_finished",
    );

  db.update(schema.matches)
    .set({ status: "live", homeScore: 0, awayScore: 0 })
    .where(eq(schema.matches.id, matchId))
    .run();

  sseHub.broadcast("score_update", {
    matchId,
    homeScore: 0,
    awayScore: 0,
    status: "live",
  });
}

/**
 * Update the running score for a live (or scheduled) match.
 *
 * Validates:
 *   bad_score      — negative, non-integer, or > 99 score values
 *   not_found      — match does not exist
 *   match_finished — match is already finished (use score correction instead)
 *
 * Broadcasts a 'score_update' SSE event on success.
 */
export function updateLiveScore(
  db: Db,
  matchId: number,
  home: number,
  away: number,
) {
  if (
    !Number.isInteger(home) ||
    !Number.isInteger(away) ||
    home < 0 ||
    away < 0 ||
    home > 99 ||
    away > 99
  ) {
    throw err("invalid score: must be integers in 0–99", 400, "bad_score");
  }

  const m = db
    .select()
    .from(schema.matches)
    .where(eq(schema.matches.id, matchId))
    .get();
  if (!m) throw err("match not found", 404, "not_found");
  if (m.status === "finished")
    throw err(
      "match is finished — use score correction",
      400,
      "match_finished",
    );

  db.update(schema.matches)
    .set({ status: "live", homeScore: home, awayScore: away })
    .where(eq(schema.matches.id, matchId))
    .run();

  sseHub.broadcast("score_update", {
    matchId,
    homeScore: home,
    awayScore: away,
    status: "live",
  });
}
