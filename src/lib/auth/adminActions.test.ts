import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, schema, type Db } from "@/lib/db";
import { hashPin, verifyPin } from "./pin";
import {
  createInvite,
  resetPin,
  unlockPlayer,
  grantAdmin,
} from "./adminActions";

let db: Db;
const NOW = "2026-06-12T10:00:00Z";

beforeEach(async () => {
  db = await createTestDb();
  await db.insert(schema.players).values([
    {
      phone: "09700000001",
      pinHash: hashPin("111111"),
      displayName: "Admin",
      role: "admin",
      createdAt: NOW,
    },
    {
      phone: "09700000002",
      pinHash: hashPin("222222"),
      displayName: "Zaw",
      createdAt: NOW,
    },
  ]);
});

it("createInvite generates an 6-char unambiguous code", async () => {
  const inv = await createInvite(db, 1, {
    maxUses: 10,
    expiresAt: "2026-07-20T00:00:00Z",
  });
  expect(inv.code).toMatch(/^[2-9A-HJ-NP-Z]{6}$/);
});

it("resetPin sets temp pin, forces change, bumps epoch, audit-logs", async () => {
  const before = (await db.select().from(schema.players))[1];
  await resetPin(db, 1, 2, "999999", NOW);
  const after = (await db.select().from(schema.players))[1];
  expect(verifyPin("999999", after.pinHash)).toBe(true);
  expect(after.mustChangePin).toBe(true);
  expect(after.sessionEpoch).toBe(before.sessionEpoch + 1);
  expect((await db.select().from(schema.auditLog))[0].action).toBe("pin_reset");
});

it("unlockPlayer clears lock; grantAdmin flips role; both audit-log", async () => {
  await db
    .update(schema.players)
    .set({ failedPinAttempts: 5, lockedUntil: "2026-06-12T10:15:00Z" });
  await unlockPlayer(db, 1, 2, NOW);
  expect((await db.select().from(schema.players))[1].lockedUntil).toBeNull();
  await grantAdmin(db, 1, 2, NOW);
  expect((await db.select().from(schema.players))[1].role).toBe("admin");
  expect(
    (await db.select().from(schema.auditLog)).map((a) => a.action),
  ).toEqual(["unlock", "grant_admin"]);
});

it("resetPin on missing player throws /not found/ and writes no audit row", async () => {
  await expect(resetPin(db, 1, 999, "123456", NOW)).rejects.toThrow(
    /not found/,
  );
  expect(await db.select().from(schema.auditLog)).toHaveLength(0);
});

it("unlockPlayer on missing player throws /not found/ and writes no audit row", async () => {
  await expect(unlockPlayer(db, 1, 999, NOW)).rejects.toThrow(/not found/);
  expect(await db.select().from(schema.auditLog)).toHaveLength(0);
});

it("grantAdmin on missing player throws /not found/ and writes no audit row", async () => {
  await expect(grantAdmin(db, 1, 999, NOW)).rejects.toThrow(/not found/);
  expect(await db.select().from(schema.auditLog)).toHaveLength(0);
});
