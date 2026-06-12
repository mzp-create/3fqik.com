import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { ok, fail, handle } from "@/lib/api";
import { nowIso } from "@/lib/time";

export async function GET() {
  return handle(async () => {
    await requireAdmin();
    return ok(getDb().select().from(schema.settings).get());
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const admin = await requireAdmin();
    const { dailyTotalLimitMmk, matchId, betLimitMmk } = await req.json();

    // Validate dailyTotalLimitMmk if present
    if (dailyTotalLimitMmk != null) {
      if (!Number.isInteger(dailyTotalLimitMmk) || dailyTotalLimitMmk < 0) {
        return fail(
          "bad_request",
          "dailyTotalLimitMmk must be an integer >= 0",
        );
      }
    }

    // Validate matchId / betLimitMmk if present
    if (matchId != null) {
      if (!Number.isInteger(matchId) || matchId <= 0) {
        return fail("bad_request", "matchId must be a positive integer");
      }
      if (betLimitMmk !== null && betLimitMmk !== undefined) {
        if (!Number.isInteger(betLimitMmk) || betLimitMmk < 0) {
          return fail(
            "bad_request",
            "betLimitMmk must be an integer >= 0 or null to clear",
          );
        }
      }
    }

    const db = getDb();
    const at = nowIso();

    if (dailyTotalLimitMmk != null) {
      db.update(schema.settings)
        .set({ dailyTotalLimitMmk })
        .where(eq(schema.settings.id, 1))
        .run();
      db.insert(schema.auditLog)
        .values({
          actorId: admin.id,
          action: "limit_change",
          subject: "daily",
          detail: String(dailyTotalLimitMmk),
          at,
        })
        .run();
    }

    if (matchId != null) {
      // betLimitMmk may be null (to clear the limit) or a positive integer
      const limitValue =
        betLimitMmk === undefined ? null : (betLimitMmk as number | null);
      db.update(schema.matches)
        .set({ betLimitMmk: limitValue })
        .where(eq(schema.matches.id, matchId))
        .run();
      db.insert(schema.auditLog)
        .values({
          actorId: admin.id,
          action: "limit_change",
          subject: `match:${matchId}`,
          detail: String(limitValue),
          at,
        })
        .run();
    }

    return ok({});
  });
}
