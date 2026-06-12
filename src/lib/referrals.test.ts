import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, schema, type Db } from "@/lib/db";
import { hashPin } from "@/lib/auth/pin";
import { registerPlayer } from "@/lib/auth/flows";
import { ensurePersonalCode, referralInfo, referrerName } from "./referrals";

const NOW = "2026-06-12T10:00:00Z";
const FAR = "2027-01-01T00:00:00Z";

let db: Db;

/** Insert a player directly (no invite flow needed for pre-existing players). */
function seedPlayer(
  d: Db,
  overrides: {
    phone?: string;
    displayName?: string;
    role?: "player" | "admin";
    referredBy?: number;
  } = {},
) {
  return d
    .insert(schema.players)
    .values({
      phone:
        overrides.phone ??
        `097${Math.floor(Math.random() * 1e8)
          .toString()
          .padStart(8, "0")}`,
      pinHash: hashPin("111111"),
      displayName: overrides.displayName ?? "TestUser",
      role: overrides.role ?? "player",
      createdAt: NOW,
      referredBy: overrides.referredBy ?? null,
    })
    .returning()
    .get();
}

/** Insert an admin invite code (kind defaults to 'admin'). */
function seedAdminCode(d: Db, adminId: number, code = "ADMIN1") {
  return d
    .insert(schema.inviteCodes)
    .values({
      code,
      maxUses: 10,
      usedCount: 0,
      expiresAt: FAR,
      createdBy: adminId,
    })
    .returning()
    .get();
}

beforeEach(() => {
  db = createTestDb();
  db.insert(schema.settings).values({ id: 1, dailyTotalLimitMmk: 0 }).run();
});

// ─── ensurePersonalCode ───────────────────────────────────────────────────────

describe("ensurePersonalCode", () => {
  it("creates a personal code for a player that has none", () => {
    const admin = seedPlayer(db, { role: "admin", displayName: "Admin" });
    const code = ensurePersonalCode(db, admin.id);
    expect(code.kind).toBe("personal");
    expect(code.createdBy).toBe(admin.id);
    expect(code.maxUses).toBe(10); // default from settings
    expect(code.usedCount).toBe(0);
    expect(code.expiresAt).toBe(FAR);
    expect(code.code).toMatch(/^[2-9A-HJ-NP-Z]{6}$/);
  });

  it("is idempotent: second call returns same row, no duplicate created", () => {
    const player = seedPlayer(db);
    const first = ensurePersonalCode(db, player.id);
    const second = ensurePersonalCode(db, player.id);
    expect(second.id).toBe(first.id);
    expect(second.code).toBe(first.code);
    const allPersonal = db
      .select()
      .from(schema.inviteCodes)
      .all()
      .filter((c) => c.kind === "personal" && c.createdBy === player.id);
    expect(allPersonal).toHaveLength(1);
  });

  it("uses settings.defaultPersonalInviteUses when set to 5", () => {
    db.update(schema.settings).set({ defaultPersonalInviteUses: 5 }).run();
    const player = seedPlayer(db);
    const code = ensurePersonalCode(db, player.id);
    expect(code.maxUses).toBe(5);
  });

  it("different players each get their own personal code", () => {
    const p1 = seedPlayer(db, { phone: "09700000001" });
    const p2 = seedPlayer(db, { phone: "09700000002" });
    const c1 = ensurePersonalCode(db, p1.id);
    const c2 = ensurePersonalCode(db, p2.id);
    expect(c1.id).not.toBe(c2.id);
    expect(c1.code).not.toBe(c2.code);
  });
});

// ─── referralInfo ─────────────────────────────────────────────────────────────

describe("referralInfo", () => {
  it("returns code, maxUses, usedCount, referredCount", () => {
    const player = seedPlayer(db);
    const info = referralInfo(db, player.id);
    expect(typeof info.code).toBe("string");
    expect(info.maxUses).toBe(10);
    expect(info.usedCount).toBe(0);
    expect(info.referredCount).toBe(0);
  });

  it("referredCount reflects players with referred_by = playerId", () => {
    const referrer = seedPlayer(db, { phone: "09700000001" });
    seedPlayer(db, { phone: "09700000002", referredBy: referrer.id });
    seedPlayer(db, { phone: "09700000003", referredBy: referrer.id });
    const info = referralInfo(db, referrer.id);
    expect(info.referredCount).toBe(2);
  });

  it("usedCount increments after a referee registers via personal code", () => {
    const referrer = seedPlayer(db, {
      phone: "09700000010",
      displayName: "Referrer",
    });
    const personalCode = ensurePersonalCode(db, referrer.id);

    registerPlayer(
      db,
      {
        code: personalCode.code,
        phone: "09700000020",
        name: "Referee",
        pin: "222222",
      },
      NOW,
    );

    const info = referralInfo(db, referrer.id);
    expect(info.usedCount).toBe(1);
    expect(info.referredCount).toBe(1);
  });
});

// ─── referrerName ─────────────────────────────────────────────────────────────

describe("referrerName", () => {
  it("returns null when player has no referrer", () => {
    const player = seedPlayer(db);
    expect(referrerName(db, player.id)).toBeNull();
  });

  it("returns display_name of the referrer", () => {
    const referrer = seedPlayer(db, {
      phone: "09700000001",
      displayName: "Ko Min",
    });
    const referee = seedPlayer(db, {
      phone: "09700000002",
      referredBy: referrer.id,
    });
    expect(referrerName(db, referee.id)).toBe("Ko Min");
  });
});

// ─── registerPlayer sets referred_by (flows integration) ─────────────────────

describe("registerPlayer referral tracking", () => {
  it("sets referred_by to admin id when using an admin-created code", () => {
    const admin = seedPlayer(db, {
      role: "admin",
      displayName: "Admin",
      phone: "09700000001",
    });
    seedAdminCode(db, admin.id, "ADMC01");

    const player = registerPlayer(
      db,
      {
        code: "ADMC01",
        phone: "09700000002",
        name: "NewPlayer",
        pin: "222222",
      },
      NOW,
    );
    expect(player.referredBy).toBe(admin.id);
  });

  it("sets referred_by to player id when using a personal code", () => {
    const referrer = seedPlayer(db, {
      phone: "09700000001",
      displayName: "Referrer",
    });
    const code = ensurePersonalCode(db, referrer.id);

    const referee = registerPlayer(
      db,
      { code: code.code, phone: "09700000002", name: "Referee", pin: "222222" },
      NOW,
    );
    expect(referee.referredBy).toBe(referrer.id);
  });

  it("referralInfo.usedCount increments when referee registers", () => {
    const referrer = seedPlayer(db, {
      phone: "09700000001",
      displayName: "Referrer",
    });
    const code = ensurePersonalCode(db, referrer.id);

    registerPlayer(
      db,
      {
        code: code.code,
        phone: "09700000002",
        name: "Referee1",
        pin: "222222",
      },
      NOW,
    );
    registerPlayer(
      db,
      {
        code: code.code,
        phone: "09700000003",
        name: "Referee2",
        pin: "333333",
      },
      NOW,
    );

    const info = referralInfo(db, referrer.id);
    expect(info.usedCount).toBe(2);
    expect(info.referredCount).toBe(2);
  });
});
