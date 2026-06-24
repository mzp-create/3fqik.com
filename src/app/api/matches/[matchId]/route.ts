import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requirePlayer } from "@/lib/auth/session";
import { latestLine } from "@/lib/lines/manage";
import { ok, fail, handle } from "@/lib/api";

/** Single match with its latest AH + O/U lines — backs the dedicated bet page
 *  (refresh-safe, avoids fetching all fixtures for one bet). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ matchId: string }> },
) {
  return handle(async () => {
    await requirePlayer();
    const { matchId } = await params;
    const id = Number(matchId);
    if (!Number.isInteger(id)) return fail("bad_request", "invalid matchId");
    const db = getDb();
    const [m] = await db
      .select()
      .from(schema.matches)
      .where(eq(schema.matches.id, id));
    if (!m) return fail("not_found", "match not found");
    const wikiRows = await db
      .select()
      .from(schema.teamWiki)
      .where(inArray(schema.teamWiki.code, [m.homeTeam, m.awayTeam]));
    const teamWiki: Record<string, unknown> = {};
    for (const r of wikiRows) {
      teamWiki[r.code] = {
        ...r,
        recentResults: r.recentResults ? JSON.parse(r.recentResults) : [],
      };
    }
    return ok({
      ...m,
      line: await latestLine(db, m.id, "ah"),
      ouLine: await latestLine(db, m.id, "ou"),
      teamWiki, // keyed by team code; missing team → absent key
    });
  });
}
