import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { setMatchLive, updateLiveScore } from "@/lib/matches/score";
import { confirmFinalScore, correctScore } from "@/lib/bets/settleMatch";
import { ok, fail, handle } from "@/lib/api";
import { nowIso } from "@/lib/time";

/**
 * Admin score management endpoint.
 *
 * Body shape: { action, matchId, home?, away? }
 *
 * Actions:
 *   live    — transition match to live status (matchId required)
 *   score   — update running live score (matchId, home, away: integers 0–99)
 *   final   — confirm the final score and grade tickets (matchId, home, away: integers 0–99)
 *   correct — re-grade after a score correction (matchId, home, away: integers 0–99)
 *
 * Validation: action is a string; matchId is an integer; home/away are integers 0–99
 * for score/final/correct actions.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const admin = await requireAdmin();
    const body = await req.json();
    const { action, matchId, home, away } = body;

    if (typeof action !== "string" || !Number.isInteger(matchId)) {
      return fail(
        "bad_request",
        "action (string) and matchId (integer) are required",
      );
    }

    const db = getDb();

    if (action === "live") {
      await setMatchLive(db, matchId);
      return ok({});
    }

    if (action === "score" || action === "final" || action === "correct") {
      if (
        !Number.isInteger(home) ||
        !Number.isInteger(away) ||
        home < 0 ||
        home > 99 ||
        away < 0 ||
        away > 99
      ) {
        return fail("bad_score", "home and away must be integers in 0–99");
      }
      if (action === "score") {
        await updateLiveScore(db, matchId, home, away);
      } else if (action === "final") {
        await confirmFinalScore(db, admin.id, matchId, home, away, nowIso());
      } else {
        await correctScore(db, admin.id, matchId, home, away, nowIso());
      }
      return ok({});
    }

    return fail("bad_action", "unknown action");
  });
}
