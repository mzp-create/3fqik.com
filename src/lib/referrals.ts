import { eq, and, count } from "drizzle-orm";
import { schema, type Db } from "@/lib/db";
import { randomCode } from "@/lib/auth/adminActions";

const PERSONAL_EXPIRES_AT = "2027-01-01T00:00:00Z";

async function selectPersonalCode(db: Db, playerId: number) {
  const [row] = await db
    .select()
    .from(schema.inviteCodes)
    .where(
      and(
        eq(schema.inviteCodes.createdBy, playerId),
        eq(schema.inviteCodes.kind, "personal"),
      ),
    );
  return row;
}

export async function ensurePersonalCode(db: Db, playerId: number) {
  const existing = await selectPersonalCode(db, playerId);
  if (existing) return existing;

  const [settings] = await db.select().from(schema.settings);
  const maxUses = settings?.defaultPersonalInviteUses ?? 10;

  try {
    const [row] = await db
      .insert(schema.inviteCodes)
      .values({
        code: randomCode(6),
        kind: "personal",
        maxUses,
        usedCount: 0,
        expiresAt: PERSONAL_EXPIRES_AT,
        createdBy: playerId,
      })
      .returning();
    return row;
  } catch (e: unknown) {
    // unique_violation — a concurrent insert won the race (now prevented
    // by the invite_personal_uq partial index, but we keep this guard for
    // defence-in-depth). Re-select and return the existing row.
    // The idempotency test covers the normal path; the race path is not
    // practically unit-testable without concurrency harness.
    if (
      e &&
      typeof e === "object" &&
      "code" in e &&
      (e as { code?: string }).code === "23505"
    ) {
      const row = await selectPersonalCode(db, playerId);
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
export async function referralInfo(
  db: Db,
  playerId: number,
): Promise<{
  code: string;
  maxUses: number;
  usedCount: number;
  referredCount: number;
}> {
  const codeRow = await ensurePersonalCode(db, playerId);

  const [{ value: referredCount }] = await db
    .select({ value: count().mapWith(Number) })
    .from(schema.players)
    .where(eq(schema.players.referredBy, playerId));

  return {
    code: codeRow.code,
    maxUses: codeRow.maxUses,
    usedCount: codeRow.usedCount,
    referredCount,
  };
}

export async function referrerName(
  db: Db,
  playerId: number,
): Promise<string | null> {
  const [player] = await db
    .select()
    .from(schema.players)
    .where(eq(schema.players.id, playerId));
  if (!player?.referredBy) return null;

  const [referrer] = await db
    .select({ displayName: schema.players.displayName })
    .from(schema.players)
    .where(eq(schema.players.id, player.referredBy));
  return referrer?.displayName ?? null;
}

/**
 * Returns the displayName of the player with the given id, or null if not found.
 * Used in bulk-list contexts where the referredBy id is already known,
 * avoiding the extra self-lookup that referrerName() performs.
 */
export async function referrerNameById(
  db: Db,
  referrerId: number,
): Promise<string | null> {
  const [referrer] = await db
    .select({ displayName: schema.players.displayName })
    .from(schema.players)
    .where(eq(schema.players.id, referrerId));
  return referrer?.displayName ?? null;
}
