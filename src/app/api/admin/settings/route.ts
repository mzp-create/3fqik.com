import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { ok, fail, handle } from "@/lib/api";
import { nowIso } from "@/lib/time";

export async function GET() {
  return handle(async () => {
    await requireAdmin();
    const [settings] = await getDb().select().from(schema.settings);
    return ok(settings);
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const admin = await requireAdmin();
    const {
      dailyTotalLimitMmk,
      matchId,
      betLimitMmk,
      commissionPct,
      discountPct,
      cancelWindowSeconds,
      stdMaxStakeMmk,
      stdOutstandingMmk,
      stdMaxBetsPerMatch,
    } = await req.json();

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

    // Validate commissionPct if present
    if (commissionPct != null) {
      if (
        !Number.isInteger(commissionPct) ||
        commissionPct < 0 ||
        commissionPct > 100
      ) {
        return fail("bad_request", "commissionPct must be an integer 0–100");
      }
    }

    // Validate discountPct if present
    if (discountPct != null) {
      if (
        !Number.isInteger(discountPct) ||
        discountPct < 0 ||
        discountPct > 100
      ) {
        return fail("bad_request", "discountPct must be an integer 0–100");
      }
    }

    // Validate cancelWindowSeconds if present (0 disables self-cancel; cap 1h)
    if (cancelWindowSeconds != null) {
      if (
        !Number.isInteger(cancelWindowSeconds) ||
        cancelWindowSeconds < 0 ||
        cancelWindowSeconds > 3600
      ) {
        return fail(
          "bad_request",
          "cancelWindowSeconds must be an integer 0–3600",
        );
      }
    }

    // Validate standard-tier caps if present
    if (stdMaxStakeMmk != null) {
      if (!Number.isInteger(stdMaxStakeMmk) || stdMaxStakeMmk < 0) {
        return fail("bad_request", "stdMaxStakeMmk must be an integer >= 0");
      }
    }
    if (stdOutstandingMmk != null) {
      if (!Number.isInteger(stdOutstandingMmk) || stdOutstandingMmk < 0) {
        return fail("bad_request", "stdOutstandingMmk must be an integer >= 0");
      }
    }
    if (stdMaxBetsPerMatch != null) {
      if (!Number.isInteger(stdMaxBetsPerMatch) || stdMaxBetsPerMatch < 0) {
        return fail(
          "bad_request",
          "stdMaxBetsPerMatch must be an integer >= 0",
        );
      }
    }

    const db = getDb();
    const at = nowIso();

    if (dailyTotalLimitMmk != null) {
      await db
        .update(schema.settings)
        .set({ dailyTotalLimitMmk })
        .where(eq(schema.settings.id, 1));
      await db.insert(schema.auditLog).values({
        actorId: admin.id,
        action: "limit_change",
        subject: "daily",
        detail: String(dailyTotalLimitMmk),
        at,
      });
    }

    if (matchId != null) {
      // betLimitMmk may be null (to clear the limit) or a positive integer
      const limitValue =
        betLimitMmk === undefined ? null : (betLimitMmk as number | null);
      await db
        .update(schema.matches)
        .set({ betLimitMmk: limitValue })
        .where(eq(schema.matches.id, matchId));
      await db.insert(schema.auditLog).values({
        actorId: admin.id,
        action: "limit_change",
        subject: `match:${matchId}`,
        detail: String(limitValue),
        at,
      });
    }

    if (commissionPct != null || discountPct != null) {
      const feeUpdate: Record<string, number> = {};
      if (commissionPct != null) feeUpdate.commissionPct = commissionPct;
      if (discountPct != null) feeUpdate.discountPct = discountPct;
      await db
        .update(schema.settings)
        .set(feeUpdate)
        .where(eq(schema.settings.id, 1));
      await db.insert(schema.auditLog).values({
        actorId: admin.id,
        action: "fee_change",
        subject: "settings",
        detail: JSON.stringify(feeUpdate),
        at,
      });
    }

    if (cancelWindowSeconds != null) {
      await db
        .update(schema.settings)
        .set({ cancelWindowSeconds })
        .where(eq(schema.settings.id, 1));
      await db.insert(schema.auditLog).values({
        actorId: admin.id,
        action: "settings_change",
        subject: "cancel_window",
        detail: String(cancelWindowSeconds),
        at,
      });
    }

    if (
      stdMaxStakeMmk != null ||
      stdOutstandingMmk != null ||
      stdMaxBetsPerMatch != null
    ) {
      const tierUpdate: Record<string, number> = {};
      if (stdMaxStakeMmk != null) tierUpdate.stdMaxStakeMmk = stdMaxStakeMmk;
      if (stdOutstandingMmk != null)
        tierUpdate.stdOutstandingMmk = stdOutstandingMmk;
      if (stdMaxBetsPerMatch != null)
        tierUpdate.stdMaxBetsPerMatch = stdMaxBetsPerMatch;
      await db
        .update(schema.settings)
        .set(tierUpdate)
        .where(eq(schema.settings.id, 1));
      await db.insert(schema.auditLog).values({
        actorId: admin.id,
        action: "limit_change",
        subject: "std_tier",
        detail: JSON.stringify(tierUpdate),
        at,
      });
    }

    return ok({});
  });
}
