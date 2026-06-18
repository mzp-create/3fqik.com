import { ne } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { ok, handle } from "@/lib/api";
import { fetchScores } from "@/lib/scores/wikipedia";
import { nowIso } from "@/lib/time";

// GET — fetch candidate final scores from Wikipedia for matches that have
// kicked off but aren't finished. Returns candidates for the admin to review
// and Confirm Final; never grades on its own.
export async function GET() {
  return handle(async () => {
    await requireAdmin();
    const db = getDb();
    const now = nowIso();

    const matches = await db
      .select()
      .from(schema.matches)
      .where(ne(schema.matches.status, "finished"));
    // Only matches whose kickoff has passed (no point fetching future games).
    const due = matches.filter((m) => m.kickoffUtc <= now);

    const { candidates, skipped } = await fetchScores(
      due.map((m) => ({
        id: m.id,
        homeTeam: m.homeTeam,
        awayTeam: m.awayTeam,
        stage: m.stage,
      })),
    );

    const byId = new Map(matches.map((m) => [m.id, m]));
    return ok({
      candidates: candidates.map((c) => {
        const m = byId.get(c.matchId)!;
        return {
          matchId: c.matchId,
          homeTeam: m.homeTeam,
          awayTeam: m.awayTeam,
          home: c.home,
          away: c.away,
        };
      }),
      found: candidates.length,
      checked: due.length,
      skipped,
    });
  });
}
