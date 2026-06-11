import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, schema, type Db } from "@/lib/db";
import { hashPin } from "@/lib/auth/pin";
import { postLine, setLineStatus } from "@/lib/lines/manage";
import { placeBet, MAX_STAKE } from "./place";

let db: Db;
const NOW = "2026-06-12T10:00:00Z";

function seedMatch(
  db: Db,
  overrides: Partial<typeof schema.matches.$inferInsert> = {},
) {
  return db
    .insert(schema.matches)
    .values({
      stage: "Group C",
      homeTeam: "BRA",
      awayTeam: "MEX",
      kickoffUtc: "2026-06-12T02:00:00Z",
      venue: "X",
      matchDay: "2026-06-12",
      ...overrides,
    })
    .returning()
    .get();
}

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
});

it("places a bet locking line version and snapshotting score", () => {
  const m = seedMatch(db, { status: "live", homeScore: 1, awayScore: 0 });
  const line = postLine(
    db,
    1,
    { matchId: m.id, favSide: "home", ballQ: 3, priceC: 92 },
    NOW,
  );
  const bet = placeBet(
    db,
    2,
    {
      matchId: m.id,
      lineVersion: line.version,
      side: "fav",
      stakeMmk: 100_000,
    },
    NOW,
  );
  expect(bet.ticketNo).toMatch(/^WB-/);
  expect(bet.scoreHomeAtBet).toBe(1);
  expect(bet.scoreAwayAtBet).toBe(0);
  expect(bet.lineId).toBe(line.id);
});

it("rejects: stale version, suspended line, finished match, sub-floor stake", () => {
  const m = seedMatch(db);
  postLine(
    db,
    1,
    { matchId: m.id, favSide: "home", ballQ: 3, priceC: 92 },
    NOW,
  );
  const l2 = postLine(
    db,
    1,
    { matchId: m.id, favSide: "home", ballQ: 4, priceC: 95 },
    NOW,
  );
  expect(() =>
    placeBet(
      db,
      2,
      { matchId: m.id, lineVersion: 1, side: "fav", stakeMmk: 50_000 },
      NOW,
    ),
  ).toThrow(/line moved/);
  setLineStatus(db, m.id, "suspended");
  expect(() =>
    placeBet(
      db,
      2,
      { matchId: m.id, lineVersion: l2.version, side: "fav", stakeMmk: 50_000 },
      NOW,
    ),
  ).toThrow(/suspended/);
  setLineStatus(db, m.id, "active");
  expect(() =>
    placeBet(
      db,
      2,
      { matchId: m.id, lineVersion: l2.version, side: "fav", stakeMmk: 9_999 },
      NOW,
    ),
  ).toThrow(/between/);
});

it("enforces the daily pool and per-match carve-out", () => {
  const a = seedMatch(db);
  const b = seedMatch(db, {
    homeTeam: "USA",
    awayTeam: "JPN",
    betLimitMmk: 150_000,
  });
  const la = postLine(
    db,
    1,
    { matchId: a.id, favSide: "home", ballQ: 2, priceC: 90 },
    NOW,
  );
  const lb = postLine(
    db,
    1,
    { matchId: b.id, favSide: "home", ballQ: 2, priceC: 90 },
    NOW,
  );
  db.update(schema.settings).set({ dailyTotalLimitMmk: 300_000 }).run();

  // carve-out match b: its own cap, not the pool
  placeBet(
    db,
    2,
    { matchId: b.id, lineVersion: lb.version, side: "fav", stakeMmk: 100_000 },
    NOW,
  );
  expect(() =>
    placeBet(
      db,
      2,
      { matchId: b.id, lineVersion: lb.version, side: "dog", stakeMmk: 60_000 },
      NOW,
    ),
  ).toThrow(/50,000/); // headroom message
  // pool match a: 300k daily, b's 100k does NOT consume it
  placeBet(
    db,
    2,
    { matchId: a.id, lineVersion: la.version, side: "fav", stakeMmk: 290_000 },
    NOW,
  );
  expect(() =>
    placeBet(
      db,
      2,
      { matchId: a.id, lineVersion: la.version, side: "dog", stakeMmk: 20_000 },
      NOW,
    ),
  ).toThrow(/10,000/);
});

it("rejects a bet on a finished match", () => {
  const m = seedMatch(db); // seed as scheduled so postLine accepts it
  const line = postLine(
    db,
    1,
    { matchId: m.id, favSide: "home", ballQ: 3, priceC: 92 },
    NOW,
  );
  // mark finished after line is posted
  db.update(schema.matches)
    .set({ status: "finished" })
    .where(eq(schema.matches.id, m.id))
    .run();
  expect(() =>
    placeBet(
      db,
      2,
      {
        matchId: m.id,
        lineVersion: line.version,
        side: "fav",
        stakeMmk: 50_000,
      },
      NOW,
    ),
  ).toThrow(/finished/);
});

it("stake boundary: exact carve-out limit accepted; second bet rejected with /0/ headroom", () => {
  const m = seedMatch(db, { betLimitMmk: 150_000 });
  const line = postLine(
    db,
    1,
    { matchId: m.id, favSide: "home", ballQ: 2, priceC: 90 },
    NOW,
  );
  // exactly 150k should be accepted
  placeBet(
    db,
    2,
    {
      matchId: m.id,
      lineVersion: line.version,
      side: "fav",
      stakeMmk: 150_000,
    },
    NOW,
  );
  // second bet of 10k should be rejected — headroom is 0
  expect(() =>
    placeBet(
      db,
      2,
      {
        matchId: m.id,
        lineVersion: line.version,
        side: "dog",
        stakeMmk: 10_000,
      },
      NOW,
    ),
  ).toThrow(/0/);
});

it("rejects betting when match day is closed", () => {
  const m = seedMatch(db);
  const line = postLine(
    db,
    1,
    { matchId: m.id, favSide: "home", ballQ: 2, priceC: 90 },
    NOW,
  );
  // insert a closed matchDays row for this date
  db.insert(schema.matchDays)
    .values({ date: "2026-06-12", status: "closed" })
    .run();
  expect(() =>
    placeBet(
      db,
      2,
      {
        matchId: m.id,
        lineVersion: line.version,
        side: "fav",
        stakeMmk: 50_000,
      },
      NOW,
    ),
  ).toThrow(/closed/);
});

it("void restores headroom: voided bet stake does not count toward carve-out", () => {
  const m = seedMatch(db, { betLimitMmk: 150_000 });
  const line = postLine(
    db,
    1,
    { matchId: m.id, favSide: "home", ballQ: 2, priceC: 90 },
    NOW,
  );
  const bet = placeBet(
    db,
    2,
    {
      matchId: m.id,
      lineVersion: line.version,
      side: "fav",
      stakeMmk: 100_000,
    },
    NOW,
  );
  // void the bet
  db.update(schema.bets)
    .set({ status: "void" })
    .where(eq(schema.bets.id, bet.id))
    .run();
  // headroom should be fully restored — 150k should succeed
  placeBet(
    db,
    2,
    {
      matchId: m.id,
      lineVersion: line.version,
      side: "fav",
      stakeMmk: 150_000,
    },
    NOW,
  );
});

it("MAX_STAKE: stake 1_000_000_001 and 2_000_000_000_000 are both rejected", () => {
  const m = seedMatch(db);
  const line = postLine(
    db,
    1,
    { matchId: m.id, favSide: "home", ballQ: 2, priceC: 90 },
    NOW,
  );
  expect(() =>
    placeBet(
      db,
      2,
      {
        matchId: m.id,
        lineVersion: line.version,
        side: "fav",
        stakeMmk: 1_000_000_001,
      },
      NOW,
    ),
  ).toThrow(/bad|between/);
  expect(() =>
    placeBet(
      db,
      2,
      {
        matchId: m.id,
        lineVersion: line.version,
        side: "fav",
        stakeMmk: 2_000_000_000_000,
      },
      NOW,
    ),
  ).toThrow(/bad|between/);
});
