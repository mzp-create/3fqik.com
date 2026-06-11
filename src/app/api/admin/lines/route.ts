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
      // Additional validation for 'post' action
      if (body.favSide !== "home" && body.favSide !== "away")
        return fail("bad_request", "favSide must be 'home' or 'away'");
      if (!Number.isInteger(body.ballQ) || body.ballQ < 0 || body.ballQ > 40)
        return fail("bad_request", "ballQ must be an integer 0–40");
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
            favSide: body.favSide,
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
