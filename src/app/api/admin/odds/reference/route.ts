import { ne } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { ok, handle } from "@/lib/api";
import { fetchReferenceOdds } from "@/lib/odds/theOddsApi";

// GET — market-reference odds (Asian handicap / totals / 1X2) from The Odds API
// for the banker's Lines Desk. Reference only; never grades or posts lines.
export async function GET() {
  return handle(async () => {
    await requireAdmin();
    const result = await fetchReferenceOdds();

    if (!result.ok) {
      // no_key / http_error / no_data — report cleanly so the UI can explain.
      return ok({
        configured: result.reason !== "no_key",
        error: result.reason,
        message: result.message,
        items: [],
      });
    }

    const db = getDb();
    const matches = await db
      .select()
      .from(schema.matches)
      .where(ne(schema.matches.status, "finished"));

    const pairKey = (a: string, b: string) => [a, b].sort().join("|");
    const byPair = new Map(
      result.markets.map((m) => [pairKey(m.homeCode, m.awayCode), m]),
    );

    const items = matches
      .map((m) => {
        const ref = byPair.get(pairKey(m.homeTeam, m.awayTeam));
        if (!ref) return null;
        // Re-orient the 1X2 line to our home/away (the feed's may differ).
        const swap = m.homeTeam !== ref.homeCode;
        const h2h = ref.h2h
          ? {
              home: swap ? ref.h2h.away : ref.h2h.home,
              draw: ref.h2h.draw,
              away: swap ? ref.h2h.home : ref.h2h.away,
            }
          : null;
        return {
          matchId: m.id,
          bookmaker: ref.bookmaker,
          ah: ref.ah, // favCode is absolute — no orientation needed
          ou: ref.ou,
          h2h,
        };
      })
      .filter(Boolean);

    return ok({
      configured: true,
      fetchedAt: result.fetchedAt,
      remaining: result.remaining,
      items,
    });
  });
}
