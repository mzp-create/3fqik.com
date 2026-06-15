import { describe, it, expect } from "vitest";
import { createTestDb, schema } from "./index";

describe("db schema", () => {
  it("round-trips a player and enforces unique phone", async () => {
    const db = await createTestDb();
    await db.insert(schema.players).values({
      phone: "09790001111",
      pinHash: "x",
      displayName: "Ko Zaw",
      createdAt: new Date().toISOString(),
    });
    const all = await db.select().from(schema.players);
    expect(all).toHaveLength(1);
    await expect(
      db.insert(schema.players).values({
        phone: "09790001111",
        pinHash: "y",
        displayName: "Dup",
        createdAt: new Date().toISOString(),
      }),
    ).rejects.toMatchObject({ cause: { code: "23505" } }); // unique_violation
  });

  it("enforces foreign keys", async () => {
    const db = await createTestDb();
    await expect(
      db.insert(schema.inviteCodes).values({
        code: "TESTCODE",
        maxUses: 5,
        expiresAt: new Date().toISOString(),
        createdBy: 999, // no such player
      }),
    ).rejects.toThrow();
  });
});
