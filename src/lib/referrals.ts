import { eq, and, count } from "drizzle-orm";
import { schema, type Db } from "@/lib/db";
import { randomCode } from "@/lib/auth/adminActions";

const PERSONAL_EXPIRES_AT = "2027-01-01T00:00:00Z";

function selectPersonalCode(db: Db, playerId: number) {
  return db
    .select()
    .from(schema.inviteCodes)
    .where(
      and(
        eq(schema.inviteCodes.createdBy, playerId),
        eq(schema.inviteCodes.kind, "personal"),
      ),
    )
    .get();
}

export function ensurePersonalCode(db: Db, playerId: number) {
  const existing = selectPersonalCode(db, playerId);
  if (existing) return existing;

  const settings = db.select().from(schema.settings).get();
  const maxUses = settings?.defaultPersonalInviteUses ?? 10;

  try {
    return db
      .insert(schema.inviteCodes)
      .values({
        code: randomCode(6),
        kind: "personal",
        maxUses,
        usedCount: 0,
        expiresAt: PERSONAL_EXPIRES_AT,
        createdBy: playerId,
      })
      .returning()
      .get();
  } catch (e: unknown) {
    // SQLITE_CONSTRAINT_UNIQUE — a concurrent insert won the race (now prevented
    // by the invite_personal_uq partial index, but we keep this guard for
    // defence-in-depth). Re-select and return the existing row.
    // The idempotency test covers the normal path; the race path is not
    // practically unit-testable without concurrency harness.
    const msg = e instanceof Error ? e.message : String(e);
    if (
      msg.includes("UNIQUE constraint failed") ||
      msg.includes("SQLITE_CONSTRAINT")
    ) {
      const row = selectPersonalCode(db, playerId);
      if (row) return row;
    }
    throw e;
  }
}

/**
 * Returns referral stats for a player.
 *
 * - `usedCount`    — number of personal-code slots consumed (how many people
 *                    registered with this player's own personal invite code).
 * - `referredCount` — ALL players whose `referred_by` = this player's id.
 *                    An admin who minted admin codes may have
 *                    referredCount > usedCount because admin-code registrations
 *                    also set referred_by to the code's creator.
 */
export function referralInfo(
  db: Db,
  playerId: number,
): { code: string; maxUses: number; usedCount: number; referredCount: number } {
  const codeRow = ensurePersonalCode(db, playerId);

  const [{ value: referredCount }] = db
    .select({ value: count() })
    .from(schema.players)
    .where(eq(schema.players.referredBy, playerId))
    .all();

  return {
    code: codeRow.code,
    maxUses: codeRow.maxUses,
    usedCount: codeRow.usedCount,
    referredCount,
  };
}

export function referrerName(db: Db, playerId: number): string | null {
  const player = db
    .select()
    .from(schema.players)
    .where(eq(schema.players.id, playerId))
    .get();
  if (!player?.referredBy) return null;

  const referrer = db
    .select({ displayName: schema.players.displayName })
    .from(schema.players)
    .where(eq(schema.players.id, player.referredBy))
    .get();
  return referrer?.displayName ?? null;
}

/**
 * Returns the displayName of the player with the given id, or null if not found.
 * Used in bulk-list contexts where the referredBy id is already known,
 * avoiding the extra self-lookup that referrerName() performs.
 */
export function referrerNameById(db: Db, referrerId: number): string | null {
  const referrer = db
    .select({ displayName: schema.players.displayName })
    .from(schema.players)
    .where(eq(schema.players.id, referrerId))
    .get();
  return referrer?.displayName ?? null;
}
