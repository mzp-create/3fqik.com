import { eq, and, count } from "drizzle-orm";
import { schema, type Db } from "@/lib/db";
import { randomCode } from "@/lib/auth/adminActions";

const PERSONAL_EXPIRES_AT = "2027-01-01T00:00:00Z";

export function ensurePersonalCode(db: Db, playerId: number) {
  const existing = db
    .select()
    .from(schema.inviteCodes)
    .where(
      and(
        eq(schema.inviteCodes.createdBy, playerId),
        eq(schema.inviteCodes.kind, "personal"),
      ),
    )
    .get();
  if (existing) return existing;

  const settings = db.select().from(schema.settings).get();
  const maxUses = settings?.defaultPersonalInviteUses ?? 10;

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
}

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
