import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, schema, type Db } from "@/lib/db";
import { hashPin } from "@/lib/auth/pin";
import { postLine } from "@/lib/lines/manage";
import { placeBet } from "./place";
import { confirmFinalScore, correctScore } from "./settleMatch";
import { eq } from "drizzle-orm";

let db: Db;
const NOW = "2026-06-12T10:00:00Z";

beforeEach(() => {
  db = createTestDb();
  db.insert(schema.players)
    .values([
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
    ])
    .run();
  db.insert(schema.settings).values({ id: 1, dailyTotalLimitMmk: 0 }).run();
  db.insert(schema.matches)
    .values([
      {
        stage: "Group C",
        homeTeam: "BRA",
        awayTeam: "MEX",
        kickoffUtc: "2026-06-12T02:00:00Z",
        venue: "X",
        matchDay: "2026-06-12",
      },
      {
        stage: "Group D",
        homeTeam: "USA",
        awayTeam: "JPN",
        kickoffUtc: "2026-06-12T05:00:00Z",
        venue: "Y",
        matchDay: "2026-06-12",
      },
    ])
    .run();
});

function bet(matchId: number, side: "fav" | "dog", stake: number) {
  const line = postLine(
    db,
    1,
    { matchId, favSide: "home", ballQ: 3, priceC: 92 },
    NOW,
  );
  return placeBet(
    db,
    2,
    { matchId, lineVersion: line.version, side, stakeMmk: stake },
    NOW,
  );
}

it("grades all pending tickets; closes the day when last match graded", () => {
  const b1 = bet(1, "fav", 100_000); // BRA -0.75 @0.92
  const b2 = bet(2, "dog", 200_000); // JPN +0.75 @0.92
  confirmFinalScore(db, 1, 1, 2, 1, NOW); // BRA 2-1 → wins by 1 → fav half_won +46,000
  let day = db.select().from(schema.matchDays).all()[0];
  expect(day.status).toBe("open"); // match 2 not graded yet
  const g1 = db
    .select()
    .from(schema.bets)
    .where(eq(schema.bets.id, b1.id))
    .get()!;
  expect(g1.status).toBe("half_won");
  expect(g1.netMmk).toBe(46_000);

  confirmFinalScore(db, 1, 2, 0, 0, NOW); // draw → dog +0.75 wins → +184,000
  const g2 = db
    .select()
    .from(schema.bets)
    .where(eq(schema.bets.id, b2.id))
    .get()!;
  expect(g2.status).toBe("won");
  expect(g2.netMmk).toBe(184_000);
  day = db.select().from(schema.matchDays).all()[0];
  expect(day.status).toBe("closed");
});

it("live bets grade on effective score", () => {
  db.update(schema.matches)
    .set({ status: "live", homeScore: 1, awayScore: 0 })
    .where(eq(schema.matches.id, 1))
    .run();
  const b = bet(1, "dog", 100_000); // MEX +0.75 at 1-0
  confirmFinalScore(db, 1, 1, 2, 1, NOW); // eff 1-1 → dog covers +0.75 → won
  const g = db
    .select()
    .from(schema.bets)
    .where(eq(schema.bets.id, b.id))
    .get()!;
  expect(g.status).toBe("won");
  expect(g.netMmk).toBe(92_000);
});

it("correction re-grades while unsettled, blocked once settled, voids excluded", () => {
  const b = bet(1, "fav", 100_000);
  confirmFinalScore(db, 1, 1, 2, 1, NOW);
  correctScore(db, 1, 1, 3, 1, NOW); // now wins by 2 → won 92,000
  const g = db
    .select()
    .from(schema.bets)
    .where(eq(schema.bets.id, b.id))
    .get()!;
  expect(g.status).toBe("won");
  expect(g.netMmk).toBe(92_000);
  expect(
    db
      .select()
      .from(schema.auditLog)
      .all()
      .some((a) => a.action === "score_correction"),
  ).toBe(true);

  db.update(schema.matchDays).set({ status: "settled" }).run();
  expect(() => correctScore(db, 1, 1, 1, 1, NOW)).toThrow(/settled/);
});
