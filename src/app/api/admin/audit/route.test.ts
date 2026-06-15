import { it, expect, beforeEach } from "vitest";
import { createTestDb, schema, type Db } from "@/lib/db";
import { hashPin } from "@/lib/auth/pin";
import { getAuditLog } from "./route";

let db: Db;
const NOW = "2026-06-12T10:00:00Z";

beforeEach(async () => {
  db = await createTestDb();
  await db.insert(schema.players).values([
    {
      phone: "09700000001",
      pinHash: hashPin("111111"),
      displayName: "AdminUser",
      role: "admin",
      createdAt: NOW,
    },
  ]);
});

it("returns audit rows with actor name resolved", async () => {
  await db.insert(schema.auditLog).values({
    actorId: 1,
    action: "void",
    subject: "ticket:T-001",
    detail: "admin error",
    at: NOW,
  });

  const rows = await getAuditLog(db);
  expect(rows).toHaveLength(1);
  expect(rows[0].actorName).toBe("AdminUser");
  expect(rows[0].action).toBe("void");
  expect(rows[0].subject).toBe("ticket:T-001");
});

it("shows 'system' when actorId is 0", async () => {
  await db.insert(schema.auditLog).values({
    actorId: 0,
    action: "score_correction",
    subject: "match:1",
    detail: "automated",
    at: NOW,
  });

  const rows = await getAuditLog(db);
  expect(rows[0].actorName).toBe("system");
});

it("returns newest-first, capped at 200", async () => {
  const entries = Array.from({ length: 5 }, (_, i) => ({
    actorId: 1,
    action: "void",
    subject: `ticket:T-${String(i).padStart(3, "0")}`,
    detail: null,
    at: `2026-06-12T${String(10 + i).padStart(2, "0")}:00:00Z`,
  }));
  await db.insert(schema.auditLog).values(entries);

  const rows = await getAuditLog(db);
  expect(rows).toHaveLength(5);
  // newest first
  expect(rows[0].at > rows[1].at).toBe(true);
});
