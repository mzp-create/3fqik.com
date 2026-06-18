import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { postLine, setLineStatus } from "@/lib/lines/manage";
import { ok, fail, handle } from "@/lib/api";
import { nowIso } from "@/lib/time";

type LineSpec = {
  matchId: number;
  market: "ah" | "ou";
  favSide?: "home" | "away";
  offeredSide?: "fav" | "dog" | "over" | "under";
  ballQ: number;
  priceC: number;
};

/** Validate one line spec; returns an error message or null. Shared by the
 *  single 'post' action and the bulk 'post_bulk' action. */
function validateLine(s: Partial<LineSpec>): string | null {
  if (typeof s.matchId !== "number") return "matchId must be a number";
  if (s.market !== "ah" && s.market !== "ou")
    return "market must be 'ah' or 'ou'";
  const minBallQ = s.market === "ou" ? 1 : 0;
  if (
    !Number.isInteger(s.ballQ) ||
    (s.ballQ as number) < minBallQ ||
    (s.ballQ as number) > 40
  )
    return s.market === "ou"
      ? "O/U goals line must be 0.25–10 (a multiple of 0.25)"
      : "handicap must be 0–10 (a multiple of 0.25)";
  if (
    !Number.isInteger(s.priceC) ||
    s.priceC === 0 ||
    (s.priceC as number) < -100 ||
    (s.priceC as number) > 100
  )
    return "price must be a signed value −1.00…+1.00 (not 0)";
  if (s.market === "ah" && s.favSide !== "home" && s.favSide !== "away")
    return "favSide must be 'home' or 'away'";
  const offerOk =
    s.market === "ah"
      ? s.offeredSide === "fav" || s.offeredSide === "dog"
      : s.offeredSide === "over" || s.offeredSide === "under";
  if (!offerOk)
    return s.market === "ah"
      ? "offeredSide must be 'fav' or 'dog'"
      : "offeredSide must be 'over' or 'under'";
  return null;
}

// ou favSide is a stored dummy (grading ignores it); default to 'home'.
const favOf = (s: LineSpec): "home" | "away" =>
  s.market === "ou" ? "home" : (s.favSide as "home" | "away");

export async function POST(req: Request) {
  return handle(async () => {
    const admin = await requireAdmin();
    const body = await req.json();
    const db = getDb();

    if (typeof body.action !== "string")
      return fail("bad_request", "action must be a string");

    // Bulk post: { action:'post_bulk', lines:[{matchId,market,favSide,ballQ,priceC}] }
    // Posts each line independently; returns per-line results so partial
    // failures (e.g. a closed/finished match) don't block the rest.
    if (body.action === "post_bulk") {
      if (!Array.isArray(body.lines))
        return fail("bad_request", "lines must be an array");
      const results: Array<{
        matchId: number;
        market: string;
        ok: boolean;
        error?: string;
      }> = [];
      for (const s of body.lines as LineSpec[]) {
        const err = validateLine(s);
        if (err) {
          results.push({
            matchId: s?.matchId,
            market: s?.market,
            ok: false,
            error: err,
          });
          continue;
        }
        try {
          await postLine(
            db,
            admin.id,
            {
              matchId: s.matchId,
              market: s.market,
              favSide: favOf(s),
              offeredSide: s.offeredSide!,
              ballQ: s.ballQ,
              priceC: s.priceC,
            },
            nowIso(),
          );
          results.push({ matchId: s.matchId, market: s.market, ok: true });
        } catch (e) {
          results.push({
            matchId: s.matchId,
            market: s.market,
            ok: false,
            error: e instanceof Error ? e.message : "error",
          });
        }
      }
      return ok({ results });
    }

    // Single-line actions below require top-level matchId + market.
    if (typeof body.matchId !== "number")
      return fail("bad_request", "matchId must be a number");
    if (body.market !== "ah" && body.market !== "ou")
      return fail("bad_request", "market must be 'ah' or 'ou'");

    if (body.action === "post") {
      const err = validateLine(body);
      if (err) return fail("bad_request", err);
      return ok(
        await postLine(
          db,
          admin.id,
          {
            matchId: body.matchId,
            market: body.market,
            favSide: favOf(body),
            offeredSide: body.offeredSide,
            ballQ: body.ballQ,
            priceC: body.priceC,
          },
          nowIso(),
        ),
      );
    }

    if (body.action === "suspend")
      return ok(
        await setLineStatus(db, body.matchId, body.market, "suspended"),
      );
    if (body.action === "resume")
      return ok(await setLineStatus(db, body.matchId, body.market, "active"));
    if (body.action === "close")
      return ok(await setLineStatus(db, body.matchId, body.market, "closed"));

    return fail("bad_action", "unknown action");
  });
}
