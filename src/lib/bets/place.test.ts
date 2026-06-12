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
    { matchId: m.id, market: "ah", favSide: "home", ballQ: 3, priceC: 92 },
    NOW,
  );
  const bet = placeBet(
    db,
    2,
    {
      matchId: m.id,
      market: "ah",
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
    { matchId: m.id, market: "ah", favSide: "home", ballQ: 3, priceC: 92 },
    NOW,
  );
  const l2 = postLine(
    db,
    1,
    { matchId: m.id, market: "ah", favSide: "home", ballQ: 4, priceC: 95 },
    NOW,
  );
  expect(() =>
    placeBet(
      db,
      2,
      {
        matchId: m.id,
        market: "ah",
        lineVersion: 1,
        side: "fav",
        stakeMmk: 50_000,
      },
      NOW,
    ),
  ).toThrow(/line moved/);
  setLineStatus(db, m.id, "ah", "suspended");
  expect(() =>
    placeBet(
      db,
      2,
      {
        matchId: m.id,
        market: "ah",
        lineVersion: l2.version,
        side: "fav",
        stakeMmk: 50_000,
      },
      NOW,
    ),
  ).toThrow(/suspended/);
  setLineStatus(db, m.id, "ah", "active");
  expect(() =>
    placeBet(
      db,
      2,
      {
        matchId: m.id,
        market: "ah",
        lineVersion: l2.version,
        side: "fav",
        stakeMmk: 9_999,
      },
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
    { matchId: a.id, market: "ah", favSide: "home", ballQ: 2, priceC: 90 },
    NOW,
  );
  const lb = postLine(
    db,
    1,
    { matchId: b.id, market: "ah", favSide: "home", ballQ: 2, priceC: 90 },
    NOW,
  );
  db.update(schema.settings).set({ dailyTotalLimitMmk: 300_000 }).run();

  // carve-out match b: its own cap, not the pool
  placeBet(
    db,
    2,
    {
      matchId: b.id,
      market: "ah",
      lineVersion: lb.version,
      side: "fav",
      stakeMmk: 100_000,
    },
    NOW,
  );
  expect(() =>
    placeBet(
      db,
      2,
      {
        matchId: b.id,
        market: "ah",
        lineVersion: lb.version,
        side: "dog",
        stakeMmk: 60_000,
      },
      NOW,
    ),
  ).toThrow(/50,000/); // headroom message
  // pool match a: 300k daily, b's 100k does NOT consume it
  placeBet(
    db,
    2,
    {
      matchId: a.id,
      market: "ah",
      lineVersion: la.version,
      side: "fav",
      stakeMmk: 290_000,
    },
    NOW,
  );
  expect(() =>
    placeBet(
      db,
      2,
      {
        matchId: a.id,
        market: "ah",
        lineVersion: la.version,
        side: "dog",
        stakeMmk: 20_000,
      },
      NOW,
    ),
  ).toThrow(/10,000/);
});

it("rejects a bet on a finished match", () => {
  const m = seedMatch(db); // seed as scheduled so postLine accepts it
  const line = postLine(
    db,
    1,
    { matchId: m.id, market: "ah", favSide: "home", ballQ: 3, priceC: 92 },
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
        market: "ah",
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
    { matchId: m.id, market: "ah", favSide: "home", ballQ: 2, priceC: 90 },
    NOW,
  );
  // exactly 150k should be accepted
  placeBet(
    db,
    2,
    {
      matchId: m.id,
      market: "ah",
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
        market: "ah",
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
    { matchId: m.id, market: "ah", favSide: "home", ballQ: 2, priceC: 90 },
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
        market: "ah",
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
    { matchId: m.id, market: "ah", favSide: "home", ballQ: 2, priceC: 90 },
    NOW,
  );
  const bet = placeBet(
    db,
    2,
    {
      matchId: m.id,
      market: "ah",
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
      market: "ah",
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
    { matchId: m.id, market: "ah", favSide: "home", ballQ: 2, priceC: 90 },
    NOW,
  );
  expect(() =>
    placeBet(
      db,
      2,
      {
        matchId: m.id,
        market: "ah",
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
        market: "ah",
        lineVersion: line.version,
        side: "fav",
        stakeMmk: 2_000_000_000_000,
      },
      NOW,
    ),
  ).toThrow(/bad|between/);
});

// ── O2 NEW TESTS ─────────────────────────────────────────────────────────────

it("ou bet happy path: snapshot, ticket, linked to ou line", () => {
  const m = seedMatch(db, { status: "live", homeScore: 1, awayScore: 0 });
  const ouLine = postLine(
    db,
    1,
    { matchId: m.id, market: "ou", favSide: "home", ballQ: 10, priceC: 90 },
    NOW,
  );
  const bet = placeBet(
    db,
    2,
    {
      matchId: m.id,
      market: "ou",
      lineVersion: ouLine.version,
      side: "over",
      stakeMmk: 100_000,
    },
    NOW,
  );
  expect(bet.ticketNo).toMatch(/^WB-/);
  expect(bet.lineId).toBe(ouLine.id);
  expect(bet.side).toBe("over");
  expect(bet.scoreHomeAtBet).toBe(1);
  expect(bet.scoreAwayAtBet).toBe(0);
});

it("stale ou version returns 409 with currentLine.market = 'ou'", () => {
  const m = seedMatch(db);
  postLine(
    db,
    1,
    { matchId: m.id, market: "ou", favSide: "home", ballQ: 10, priceC: 90 },
    NOW,
  );
  // post a second ou line → v1 is now stale
  postLine(
    db,
    1,
    { matchId: m.id, market: "ou", favSide: "home", ballQ: 11, priceC: 92 },
    NOW,
  );
  let caught:
    | (Error & {
        httpStatus?: number;
        extra?: { currentLine?: { market?: string } };
      })
    | null = null;
  try {
    placeBet(
      db,
      2,
      {
        matchId: m.id,
        market: "ou",
        lineVersion: 1,
        side: "over",
        stakeMmk: 50_000,
      },
      NOW,
    );
  } catch (e) {
    caught = e as typeof caught;
  }
  expect(caught).not.toBeNull();
  expect(caught!.httpStatus).toBe(409);
  expect(caught!.extra?.currentLine?.market).toBe("ou");
});

it("ah line stale check is unaffected by ou posts: ah v1 still valid after posting ou v2", () => {
  const m = seedMatch(db);
  const ahLine = postLine(
    db,
    1,
    { matchId: m.id, market: "ah", favSide: "home", ballQ: 3, priceC: 92 },
    NOW,
  );
  // post two ou lines — should not bump the ah version
  postLine(
    db,
    1,
    { matchId: m.id, market: "ou", favSide: "home", ballQ: 10, priceC: 90 },
    NOW,
  );
  postLine(
    db,
    1,
    { matchId: m.id, market: "ou", favSide: "home", ballQ: 11, priceC: 92 },
    NOW,
  );
  // placing an ah bet with v1 should still succeed
  const bet = placeBet(
    db,
    2,
    {
      matchId: m.id,
      market: "ah",
      lineVersion: ahLine.version,
      side: "fav",
      stakeMmk: 50_000,
    },
    NOW,
  );
  expect(bet.lineId).toBe(ahLine.id);
});

it("side-market mismatch is rejected with bad_side: over on ah, fav on ou", () => {
  const m = seedMatch(db);
  const ahLine = postLine(
    db,
    1,
    { matchId: m.id, market: "ah", favSide: "home", ballQ: 3, priceC: 92 },
    NOW,
  );
  const ouLine = postLine(
    db,
    1,
    { matchId: m.id, market: "ou", favSide: "home", ballQ: 10, priceC: 90 },
    NOW,
  );

  // over on ah market → bad_side
  let e1: { code?: string } | null = null;
  try {
    placeBet(
      db,
      2,
      {
        matchId: m.id,
        market: "ah",
        lineVersion: ahLine.version,
        side: "over" as "fav", // intentional runtime mismatch — ah+over → bad_side
        stakeMmk: 50_000,
      },
      NOW,
    );
  } catch (e) {
    e1 = e as { code?: string };
  }
  expect(e1?.code).toBe("bad_side");

  // fav on ou market → bad_side
  let e2: { code?: string } | null = null;
  try {
    placeBet(
      db,
      2,
      {
        matchId: m.id,
        market: "ou",
        lineVersion: ouLine.version,
        side: "fav" as "over", // intentional runtime mismatch — ou+fav → bad_side
        stakeMmk: 50_000,
      },
      NOW,
    );
  } catch (e) {
    e2 = e as { code?: string };
  }
  expect(e2?.code).toBe("bad_side");
});

it("limits count ah+ou stakes together against one match cap", () => {
  // carve-out match with 200k cap; post both markets
  const m = seedMatch(db, { betLimitMmk: 200_000 });
  const ahLine = postLine(
    db,
    1,
    { matchId: m.id, market: "ah", favSide: "home", ballQ: 3, priceC: 92 },
    NOW,
  );
  const ouLine = postLine(
    db,
    1,
    { matchId: m.id, market: "ou", favSide: "home", ballQ: 10, priceC: 90 },
    NOW,
  );

  // bet 130k on ah — uses 130k of 200k cap
  placeBet(
    db,
    2,
    {
      matchId: m.id,
      market: "ah",
      lineVersion: ahLine.version,
      side: "fav",
      stakeMmk: 130_000,
    },
    NOW,
  );

  // bet 50k on ou — uses 50k more → 180k total, still under 200k
  placeBet(
    db,
    2,
    {
      matchId: m.id,
      market: "ou",
      lineVersion: ouLine.version,
      side: "over",
      stakeMmk: 50_000,
    },
    NOW,
  );

  // try to bet 30k more (would take total to 210k) → should fail with ~20k headroom
  expect(() =>
    placeBet(
      db,
      2,
      {
        matchId: m.id,
        market: "ou",
        lineVersion: ouLine.version,
        side: "under",
        stakeMmk: 30_000,
      },
      NOW,
    ),
  ).toThrow(/20,000/);
});

it("suspended ou line rejects placement with line_suspended code", () => {
  const m = seedMatch(db);
  const ouLine = postLine(
    db,
    1,
    { matchId: m.id, market: "ou", favSide: "home", ballQ: 10, priceC: 90 },
    NOW,
  );
  setLineStatus(db, m.id, "ou", "suspended");

  let caught: (Error & { code?: string }) | null = null;
  try {
    placeBet(
      db,
      2,
      {
        matchId: m.id,
        market: "ou",
        lineVersion: ouLine.version,
        side: "over",
        stakeMmk: 50_000,
      },
      NOW,
    );
  } catch (e) {
    caught = e as Error & { code?: string };
  }
  expect(caught).not.toBeNull();
  expect(caught!.code).toBe("line_suspended");
  expect(caught!.message).toMatch(/suspended/);
});
