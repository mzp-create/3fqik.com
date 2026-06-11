import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { postLine, setLineStatus } from "@/lib/lines/manage";
import { ok, fail, handle } from "@/lib/api";
import { nowIso } from "@/lib/time";

export async function POST(req: Request) {
  return handle(async () => {
    const admin = await requireAdmin();
    const body = await req.json();
    const db = getDb();

    // Validate: action must be a string
    if (typeof body.action !== "string")
      return fail("bad_request", "action must be a string");
    // Validate: matchId must be a number
    if (typeof body.matchId !== "number")
      return fail("bad_request", "matchId must be a number");
    // Validate: market must be 'ah' or 'ou'
    if (body.market !== "ah" && body.market !== "ou")
      return fail("bad_request", "market must be 'ah' or 'ou'");

    if (body.action === "post") {
      // For 'ou' market, favSide is semantically meaningless (grading ignores it);
      // we default to 'home' as a stored dummy. For 'ah', favSide is required.
      const favSide: "home" | "away" =
        body.market === "ou"
          ? "home"
          : body.favSide === "home" || body.favSide === "away"
            ? body.favSide
            : null!;
      if (body.market === "ah" && favSide === null)
        return fail("bad_request", "favSide must be 'home' or 'away'");
      // ou ballQ ≥ 1 (no O 0.0 lines); ah ballQ ≥ 0
      const minBallQ = body.market === "ou" ? 1 : 0;
      if (
        !Number.isInteger(body.ballQ) ||
        body.ballQ < minBallQ ||
        body.ballQ > 40
      )
        return fail(
          "bad_request",
          body.market === "ou"
            ? "ballQ must be an integer 1–40 for ou market (minimum O/U 0.25)"
            : "ballQ must be an integer 0–40",
        );
      if (
        !Number.isInteger(body.priceC) ||
        body.priceC === 0 ||
        body.priceC < -100 ||
        body.priceC > 100
      )
        return fail(
          "bad_request",
          "priceC must be a non-zero integer in [-100, 100]",
        );
      return ok(
        postLine(
          db,
          admin.id,
          {
            matchId: body.matchId,
            market: body.market,
            favSide,
            ballQ: body.ballQ,
            priceC: body.priceC,
          },
          nowIso(),
        ),
      );
    }

    if (body.action === "suspend")
      return ok(setLineStatus(db, body.matchId, body.market, "suspended"));
    if (body.action === "resume")
      return ok(setLineStatus(db, body.matchId, body.market, "active"));
    if (body.action === "close")
      return ok(setLineStatus(db, body.matchId, body.market, "closed"));

    return fail("bad_action", "unknown action");
  });
}
