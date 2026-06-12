import { getDb, schema } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { resetPin, unlockPlayer, grantAdmin } from "@/lib/auth/adminActions";
import { ok, fail, handle } from "@/lib/api";
import { nowIso } from "@/lib/time";
import { referrerName } from "@/lib/referrals";

export async function GET() {
  return handle(async () => {
    await requireAdmin();
    const db = getDb();
    const rows = db.select().from(schema.players).all();
    return ok(
      rows.map(({ pinHash: _ph, ...rest }) => ({
        ...rest,
        referredByName: referrerName(db, rest.id),
      })),
    );
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const admin = await requireAdmin();
    const body = await req.json();
    const { action, playerId, tempPin } = body;
    if (typeof action !== "string" || typeof playerId !== "number")
      return fail(
        "bad_request",
        "action must be a string and playerId must be a number",
      );
    const db = getDb();
    if (action === "reset_pin") {
      if (!/^\d{6}$/.test(String(tempPin ?? "")))
        return fail("bad_request", "tempPin must be exactly 6 digits");
      resetPin(db, admin.id, playerId, tempPin as string, nowIso());
    } else if (action === "unlock") {
      unlockPlayer(db, admin.id, playerId, nowIso());
    } else if (action === "grant_admin") {
      grantAdmin(db, admin.id, playerId, nowIso());
    } else {
      return fail("bad_action", "unknown action");
    }
    return ok({});
  });
}
