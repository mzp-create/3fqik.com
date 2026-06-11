import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, schema, type Db } from "@/lib/db";
import { hashPin } from "@/lib/auth/pin";
import { postLine } from "@/lib/lines/manage";
import { placeBet } from "./place";
import { confirmFinalScore, correctScore } from "./settleMatch";
import { eq } from "drizzle-orm";
import { sseHub } from "@/lib/sse";

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

// ─── NEW TESTS ────────────────────────────────────────────────────────────────

it("void exclusion: voided bet stays void after grading and after correctScore", () => {
  const b = bet(1, "fav", 100_000);
  // void the bet before confirming
  db.update(schema.bets)
    .set({ status: "void", netMmk: null })
    .where(eq(schema.bets.id, b.id))
    .run();

  confirmFinalScore(db, 1, 1, 2, 1, NOW);

  const afterConfirm = db
    .select()
    .from(schema.bets)
    .where(eq(schema.bets.id, b.id))
    .get()!;
  expect(afterConfirm.status).toBe("void");
  expect(afterConfirm.netMmk).toBeNull();

  // also after correctScore
  correctScore(db, 1, 1, 3, 1, NOW);

  const afterCorrect = db
    .select()
    .from(schema.bets)
    .where(eq(schema.bets.id, b.id))
    .get()!;
  expect(afterCorrect.status).toBe("void");
  expect(afterCorrect.netMmk).toBeNull();
});

it("double confirm: second confirmFinalScore throws /already finished/", () => {
  bet(1, "fav", 100_000);
  confirmFinalScore(db, 1, 1, 2, 1, NOW);
  expect(() => confirmFinalScore(db, 1, 1, 2, 1, NOW)).toThrow(
    /already finished/,
  );
});

it("VAR clamp: live bet at 2-1, final 0-0 → graded as effective 0-0", () => {
  // Set match live with score 2-1
  db.update(schema.matches)
    .set({ status: "live", homeScore: 2, awayScore: 1 })
    .where(eq(schema.matches.id, 1))
    .run();

  // Place a dog (MEX) bet at 2-1 — line is BRA home fav, ballQ=3 (0.75 balls), priceC=92
  const b = bet(1, "dog", 100_000);

  // Final score 0-0 → VAR reversal scenario
  // effHome = 0 - 2 = -2, clamped to 0
  // effAway = 0 - 1 = -1, clamped to 0
  // dog eff score: 0 vs fav eff score: 0 → effective 0-0
  // ballQ=3 (0.75): dog needs to concede fewer than 0.75 goals → at eff 0-0, dog push/half_won
  // With ballQ=3 (0.75): favMargin = effFav - effDog = 0 - 0 = 0
  // 0 < 0.75: dog wins → dog side "won", net = stake * 0.92 = 92,000
  confirmFinalScore(db, 1, 1, 0, 0, NOW);

  const g = db
    .select()
    .from(schema.bets)
    .where(eq(schema.bets.id, b.id))
    .get()!;
  // effFav=0, effDog=0, ballQ=3 (0.75 handicap), dog wins because fav margin 0 < 0.75
  expect(g.status).toBe("won");
  expect(g.netMmk).toBe(92_000);
});

it("invalid scores: home 100 or fractional → /invalid score/", () => {
  expect(() => confirmFinalScore(db, 1, 1, 100, 0, NOW)).toThrow(
    /invalid score/,
  );
  expect(() => confirmFinalScore(db, 1, 1, 1.5, 0, NOW)).toThrow(
    /invalid score/,
  );
});

it("correctScore on scheduled match → /not finished/", () => {
  // match 1 is scheduled (default), not finished
  expect(() => correctScore(db, 1, 1, 2, 1, NOW)).toThrow(/not finished/);
});

it("correction on closed-not-settled day succeeds, day stays closed", () => {
  bet(1, "fav", 100_000);
  // Confirm both matches so day closes
  confirmFinalScore(db, 1, 1, 2, 1, NOW);
  confirmFinalScore(db, 1, 2, 0, 0, NOW);

  // Day should be closed
  const dayBefore = db.select().from(schema.matchDays).all()[0];
  expect(dayBefore.status).toBe("closed");

  // correctScore should succeed on a closed (non-settled) day
  correctScore(db, 1, 1, 3, 1, NOW);

  const dayAfter = db.select().from(schema.matchDays).all()[0];
  expect(dayAfter.status).toBe("closed"); // still closed, not reverted
});

it("paid-ticket guard: correctScore throws /settled/ when ticket has settlementId", () => {
  const b = bet(1, "fav", 100_000);
  confirmFinalScore(db, 1, 1, 2, 1, NOW);

  // Create a matchDays row (already exists from confirmFinalScore closing the day via bet(2) or we need both matches done)
  // Actually match 2 hasn't been confirmed, so day is still open. Let's get or create the day.
  // The matchDays row might not exist yet — let's insert or get it
  let dayRow = db
    .select()
    .from(schema.matchDays)
    .where(eq(schema.matchDays.date, "2026-06-12"))
    .get();
  if (!dayRow) {
    dayRow = db
      .insert(schema.matchDays)
      .values({ date: "2026-06-12" })
      .returning()
      .get();
  }

  // Insert a settlement row (FK requires matchDayId + playerId)
  const settlement = db
    .insert(schema.settlements)
    .values({
      ref: "S-0612-01",
      matchDayId: dayRow.id,
      playerId: 2,
      netMmk: 46_000,
      markedBy: 1,
      markedAt: NOW,
    })
    .returning()
    .get();

  // Stamp the ticket with the settlementId
  db.update(schema.bets)
    .set({ settlementId: settlement.id })
    .where(eq(schema.bets.id, b.id))
    .run();

  expect(() => correctScore(db, 1, 1, 3, 1, NOW)).toThrow(/settled/);
});

it("day_closed broadcast: fires exactly once with correct date when last match graded", () => {
  const chunks: string[] = [];
  const unsub = sseHub.subscribe((chunk) => chunks.push(chunk));

  try {
    // Only match 1 on this day — confirming it closes the day
    // First remove match 2 from the equation by keeping only match 1
    // Actually both matches share the same day. Confirm match 2 first silently,
    // then confirm match 1 and check the broadcast.
    // Better: use a fresh db with only one match on the day.
    // We can't easily re-seed here, so let's just confirm both and watch the second call.
    confirmFinalScore(db, 1, 1, 2, 1, NOW); // day still open (match 2 pending)
    const beforeSecond = chunks.length;
    confirmFinalScore(db, 1, 2, 0, 0, NOW); // this should close the day

    const newChunks = chunks.slice(beforeSecond);
    const dayClosedChunks = newChunks.filter((c) => c.includes("day_closed"));
    expect(dayClosedChunks).toHaveLength(1);
    expect(dayClosedChunks[0]).toContain("2026-06-12");
  } finally {
    unsub();
  }
});
