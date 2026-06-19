import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, schema, type Db } from "@/lib/db";
import { hashPin } from "@/lib/auth/pin";
import { postLine, setLineStatus } from "@/lib/lines/manage";
import { placeBet, recordBet, MAX_STAKE } from "./place";

let db: Db;
const NOW = "2026-06-12T10:00:00Z";

async function seedMatch(
  db: Db,
  overrides: Partial<typeof schema.matches.$inferInsert> = {},
) {
  const [row] = await db
    .insert(schema.matches)
    .values({
      stage: "Group C",
      homeTeam: "BRA",
      awayTeam: "MEX",
      kickoffUtc: "2026-06-12T20:00:00Z",
      venue: "X",
      matchDay: "2026-06-12",
      ...overrides,
    })
    .returning();
  return row;
}

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
  await db.insert(schema.settings).values({ id: 1, dailyTotalLimitMmk: 0 });
});

it("places a bet locking line version and snapshotting score", async () => {
  const m = await seedMatch(db);
  const line = await postLine(
    db,
    1,
    {
      matchId: m.id,
      market: "ah",
      favSide: "home",
      ballQ: 3,
      priceC: 92,
    },
    NOW,
  );
  const bet = await placeBet(
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
  expect(bet.scoreHomeAtBet).toBe(0);
  expect(bet.scoreAwayAtBet).toBe(0);
  expect(bet.lineId).toBe(line.id);
});

it("rejects: stale version, suspended line, finished match, sub-floor stake", async () => {
  const m = await seedMatch(db);
  await postLine(
    db,
    1,
    {
      matchId: m.id,
      market: "ah",
      favSide: "home",
      ballQ: 3,
      priceC: 92,
    },
    NOW,
  );
  const l2 = await postLine(
    db,
    1,
    {
      matchId: m.id,
      market: "ah",
      favSide: "home",
      ballQ: 4,
      priceC: 95,
    },
    NOW,
  );
  await expect(
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
  ).rejects.toThrow(/line moved/);
  await setLineStatus(db, m.id, "ah", "suspended");
  await expect(
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
  ).rejects.toThrow(/suspended/);
  await setLineStatus(db, m.id, "ah", "active");
  await expect(
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
  ).rejects.toThrow(/between/);
});

it("enforces the daily pool and per-match carve-out", async () => {
  const a = await seedMatch(db);
  const b = await seedMatch(db, {
    homeTeam: "USA",
    awayTeam: "JPN",
    betLimitMmk: 150_000,
  });
  const la = await postLine(
    db,
    1,
    {
      matchId: a.id,
      market: "ah",
      favSide: "home",
      ballQ: 2,
      priceC: 90,
    },
    NOW,
  );
  const lb = await postLine(
    db,
    1,
    {
      matchId: b.id,
      market: "ah",
      favSide: "home",
      ballQ: 2,
      priceC: 90,
    },
    NOW,
  );
  await db.update(schema.settings).set({ dailyTotalLimitMmk: 300_000 });

  // carve-out match b: its own cap, not the pool
  await placeBet(
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
  // re-post offering dog so the next (rejected-on-limit) bet uses the offered side
  const lbDog = await postLine(
    db,
    1,
    {
      matchId: b.id,
      market: "ah",
      favSide: "home",
      ballQ: 2,
      priceC: 90,
    },
    NOW,
  );
  await expect(
    placeBet(
      db,
      2,
      {
        matchId: b.id,
        market: "ah",
        lineVersion: lbDog.version,
        side: "dog",
        stakeMmk: 60_000,
      },
      NOW,
    ),
  ).rejects.toThrow(/50,000/); // headroom message
  // pool match a: 300k daily, b's 100k does NOT consume it
  await placeBet(
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
  // re-post offering dog so the next (rejected-on-limit) bet uses the offered side
  const laDog = await postLine(
    db,
    1,
    {
      matchId: a.id,
      market: "ah",
      favSide: "home",
      ballQ: 2,
      priceC: 90,
    },
    NOW,
  );
  await expect(
    placeBet(
      db,
      2,
      {
        matchId: a.id,
        market: "ah",
        lineVersion: laDog.version,
        side: "dog",
        stakeMmk: 20_000,
      },
      NOW,
    ),
  ).rejects.toThrow(/10,000/);
});

it("rejects a bet on a finished match", async () => {
  const m = await seedMatch(db); // seed as scheduled so postLine accepts it
  const line = await postLine(
    db,
    1,
    {
      matchId: m.id,
      market: "ah",
      favSide: "home",
      ballQ: 3,
      priceC: 92,
    },
    NOW,
  );
  // mark finished after line is posted
  await db
    .update(schema.matches)
    .set({ status: "finished" })
    .where(eq(schema.matches.id, m.id));
  await expect(
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
  ).rejects.toThrow(/started/);
});

it("stake boundary: exact carve-out limit accepted; second bet rejected with /0/ headroom", async () => {
  const m = await seedMatch(db, { betLimitMmk: 150_000 });
  const line = await postLine(
    db,
    1,
    {
      matchId: m.id,
      market: "ah",
      favSide: "home",
      ballQ: 2,
      priceC: 90,
    },
    NOW,
  );
  // exactly 150k should be accepted
  await placeBet(
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
  // re-post offering dog so the next (rejected-on-limit) bet uses the offered side
  const lineDog = await postLine(
    db,
    1,
    {
      matchId: m.id,
      market: "ah",
      favSide: "home",
      ballQ: 2,
      priceC: 90,
    },
    NOW,
  );
  // second bet of 10k should be rejected — headroom is 0
  await expect(
    placeBet(
      db,
      2,
      {
        matchId: m.id,
        market: "ah",
        lineVersion: lineDog.version,
        side: "dog",
        stakeMmk: 10_000,
      },
      NOW,
    ),
  ).rejects.toThrow(/0/);
});

it("rejects betting when match day is closed", async () => {
  const m = await seedMatch(db);
  const line = await postLine(
    db,
    1,
    {
      matchId: m.id,
      market: "ah",
      favSide: "home",
      ballQ: 2,
      priceC: 90,
    },
    NOW,
  );
  // insert a closed matchDays row for this date
  await db
    .insert(schema.matchDays)
    .values({ date: "2026-06-12", status: "closed" });
  await expect(
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
  ).rejects.toThrow(/closed/);
});

it("void restores headroom: voided bet stake does not count toward carve-out", async () => {
  const m = await seedMatch(db, { betLimitMmk: 150_000 });
  const line = await postLine(
    db,
    1,
    {
      matchId: m.id,
      market: "ah",
      favSide: "home",
      ballQ: 2,
      priceC: 90,
    },
    NOW,
  );
  const bet = await placeBet(
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
  await db
    .update(schema.bets)
    .set({ status: "void" })
    .where(eq(schema.bets.id, bet.id));
  // headroom should be fully restored — 150k should succeed
  await placeBet(
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

it("MAX_STAKE: stake 1_000_000_001 and 2_000_000_000_000 are both rejected", async () => {
  const m = await seedMatch(db);
  const line = await postLine(
    db,
    1,
    {
      matchId: m.id,
      market: "ah",
      favSide: "home",
      ballQ: 2,
      priceC: 90,
    },
    NOW,
  );
  await expect(
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
  ).rejects.toThrow(/bad|between/);
  await expect(
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
  ).rejects.toThrow(/bad|between/);
});

// ── O2 NEW TESTS ─────────────────────────────────────────────────────────────

it("ou bet happy path: snapshot, ticket, linked to ou line", async () => {
  const m = await seedMatch(db);
  const ouLine = await postLine(
    db,
    1,
    {
      matchId: m.id,
      market: "ou",
      favSide: "home",
      ballQ: 10,
      priceC: 90,
    },
    NOW,
  );
  const bet = await placeBet(
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
  expect(bet.scoreHomeAtBet).toBe(0);
  expect(bet.scoreAwayAtBet).toBe(0);
});

it("stale ou version returns 409 with currentLine.market = 'ou'", async () => {
  const m = await seedMatch(db);
  await postLine(
    db,
    1,
    {
      matchId: m.id,
      market: "ou",
      favSide: "home",
      ballQ: 10,
      priceC: 90,
    },
    NOW,
  );
  // post a second ou line → v1 is now stale
  await postLine(
    db,
    1,
    {
      matchId: m.id,
      market: "ou",
      favSide: "home",
      ballQ: 11,
      priceC: 92,
    },
    NOW,
  );
  let caught:
    | (Error & {
        httpStatus?: number;
        extra?: { currentLine?: { market?: string } };
      })
    | null = null;
  try {
    await placeBet(
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

it("ah line stale check is unaffected by ou posts: ah v1 still valid after posting ou v2", async () => {
  const m = await seedMatch(db);
  const ahLine = await postLine(
    db,
    1,
    {
      matchId: m.id,
      market: "ah",
      favSide: "home",
      ballQ: 3,
      priceC: 92,
    },
    NOW,
  );
  // post two ou lines — should not bump the ah version
  await postLine(
    db,
    1,
    {
      matchId: m.id,
      market: "ou",
      favSide: "home",
      ballQ: 10,
      priceC: 90,
    },
    NOW,
  );
  await postLine(
    db,
    1,
    {
      matchId: m.id,
      market: "ou",
      favSide: "home",
      ballQ: 11,
      priceC: 92,
    },
    NOW,
  );
  // placing an ah bet with v1 should still succeed
  const bet = await placeBet(
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

it("side-market mismatch is rejected with bad_side: over on ah, fav on ou", async () => {
  const m = await seedMatch(db);
  const ahLine = await postLine(
    db,
    1,
    {
      matchId: m.id,
      market: "ah",
      favSide: "home",
      ballQ: 3,
      priceC: 92,
    },
    NOW,
  );
  const ouLine = await postLine(
    db,
    1,
    {
      matchId: m.id,
      market: "ou",
      favSide: "home",
      ballQ: 10,
      priceC: 90,
    },
    NOW,
  );

  // over on ah market → bad_side
  let e1: { code?: string } | null = null;
  try {
    await placeBet(
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
    await placeBet(
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

it("limits count ah+ou stakes together against one match cap", async () => {
  // carve-out match with 200k cap; post both markets
  const m = await seedMatch(db, { betLimitMmk: 200_000 });
  const ahLine = await postLine(
    db,
    1,
    {
      matchId: m.id,
      market: "ah",
      favSide: "home",
      ballQ: 3,
      priceC: 92,
    },
    NOW,
  );
  const ouLine = await postLine(
    db,
    1,
    {
      matchId: m.id,
      market: "ou",
      favSide: "home",
      ballQ: 10,
      priceC: 90,
    },
    NOW,
  );

  // bet 130k on ah — uses 130k of 200k cap
  await placeBet(
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
  await placeBet(
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

  // re-post ou offering under so the next (rejected-on-limit) bet uses the offered side
  const ouLineUnder = await postLine(
    db,
    1,
    {
      matchId: m.id,
      market: "ou",
      favSide: "home",
      ballQ: 10,
      priceC: 90,
    },
    NOW,
  );

  // try to bet 30k more (would take total to 210k) → should fail with ~20k headroom
  await expect(
    placeBet(
      db,
      2,
      {
        matchId: m.id,
        market: "ou",
        lineVersion: ouLineUnder.version,
        side: "under",
        stakeMmk: 30_000,
      },
      NOW,
    ),
  ).rejects.toThrow(/20,000/);
});

it("suspended ou line rejects placement with line_suspended code", async () => {
  const m = await seedMatch(db);
  const ouLine = await postLine(
    db,
    1,
    {
      matchId: m.id,
      market: "ou",
      favSide: "home",
      ballQ: 10,
      priceC: 90,
    },
    NOW,
  );
  await setLineStatus(db, m.id, "ou", "suspended");

  let caught: (Error & { code?: string }) | null = null;
  try {
    await placeBet(
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

it("two-sided: fav snapshots priceC, dog snapshots priceOppC; unpriced side rejected", async () => {
  const m = await seedMatch(db);
  const line = await postLine(
    db,
    1,
    {
      matchId: m.id,
      market: "ah",
      favSide: "home",
      ballQ: 3,
      priceC: 92,
      priceOppC: -98,
    },
    NOW,
  );
  const favBet = await placeBet(
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
  );
  const dogBet = await placeBet(
    db,
    2,
    {
      matchId: m.id,
      market: "ah",
      lineVersion: line.version,
      side: "dog",
      stakeMmk: 50_000,
    },
    NOW,
  );
  expect(favBet.priceC).toBe(92);
  expect(dogBet.priceC).toBe(-98);

  // A line with no opposite price (direct insert, priceOppC null) → side not bettable.
  const m2 = await seedMatch(db, { homeTeam: "ARG", awayTeam: "GER" });
  const [oneSided] = await db
    .insert(schema.lines)
    .values({
      matchId: m2.id,
      market: "ah",
      version: 1,
      favSide: "home",
      offeredSide: "fav",
      ballQ: 3,
      priceC: 92,
      priceOppC: null,
      status: "active",
      postedBy: 1,
      postedAt: NOW,
    })
    .returning();
  await expect(
    placeBet(
      db,
      2,
      {
        matchId: m2.id,
        market: "ah",
        lineVersion: oneSided.version,
        side: "dog",
        stakeMmk: 50_000,
      },
      NOW,
    ),
  ).rejects.toThrow(/not offered/);
});

// ── STARTED-GATE GUARDRAIL ────────────────────────────────────────────────────

it("placeBet rejects when kickoff has passed (betting_started)", async () => {
  // scheduled match but kickoff is BEFORE `at`
  const m = await seedMatch(db, { kickoffUtc: "2026-06-12T02:00:00Z" });
  const line = await postLine(
    db,
    1,
    {
      matchId: m.id,
      market: "ah",
      favSide: "home",
      ballQ: 3,
      priceC: 92,
    },
    NOW,
  );
  let caught: (Error & { code?: string }) | null = null;
  try {
    await placeBet(
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
    );
  } catch (e) {
    caught = e as Error & { code?: string };
  }
  expect(caught).not.toBeNull();
  expect(caught!.code).toBe("betting_started");
});

it("placeBet rejects when match status is live (betting_started)", async () => {
  // future kickoff is irrelevant once status is live
  const m = await seedMatch(db);
  const line = await postLine(
    db,
    1,
    {
      matchId: m.id,
      market: "ah",
      favSide: "home",
      ballQ: 3,
      priceC: 92,
    },
    NOW,
  );
  await db
    .update(schema.matches)
    .set({ status: "live", homeScore: 1, awayScore: 0 })
    .where(eq(schema.matches.id, m.id));
  let caught: (Error & { code?: string }) | null = null;
  try {
    await placeBet(
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
    );
  } catch (e) {
    caught = e as Error & { code?: string };
  }
  expect(caught).not.toBeNull();
  expect(caught!.code).toBe("betting_started");
});

it("recordBet succeeds on a live match (admin path bypasses started gate)", async () => {
  const m = await seedMatch(db, {
    status: "live",
    homeScore: 1,
    awayScore: 0,
  });
  const line = await postLine(
    db,
    1,
    {
      matchId: m.id,
      market: "ah",
      favSide: "home",
      ballQ: 3,
      priceC: 92,
    },
    NOW,
  );
  // default score-at-bet is 0–0
  const bet = await recordBet(
    db,
    1,
    {
      playerId: 2,
      matchId: m.id,
      market: "ah",
      side: "fav",
      stakeMmk: 100_000,
    },
    NOW,
  );
  expect(bet.ticketNo).toMatch(/^WB-/);
  expect(bet.lineId).toBe(line.id);
  expect(bet.side).toBe("fav");
  expect(bet.priceC).toBe(92);
  expect(bet.scoreHomeAtBet).toBe(0);
  expect(bet.scoreAwayAtBet).toBe(0);

  // variant: explicit score-at-bet persists
  const bet2 = await recordBet(
    db,
    1,
    {
      playerId: 2,
      matchId: m.id,
      market: "ah",
      side: "fav",
      stakeMmk: 100_000,
      scoreHomeAtBet: 1,
      scoreAwayAtBet: 0,
    },
    NOW,
  );
  expect(bet2.scoreHomeAtBet).toBe(1);
  expect(bet2.scoreAwayAtBet).toBe(0);
});

// ── USER TIERS & LIMITS (Task 2 — MONEY CORE) ────────────────────────────────

it("standard tier: rejects a bet over the per-bet cap", async () => {
  const m = await seedMatch(db);
  const line = await postLine(
    db,
    1,
    {
      matchId: m.id,
      market: "ah",
      favSide: "home",
      ballQ: 3,
      priceC: 92,
      priceOppC: -98,
    },
    NOW,
  );
  await expect(
    placeBet(
      db,
      2,
      {
        matchId: m.id,
        market: "ah",
        lineVersion: line.version,
        side: "fav",
        stakeMmk: 600_000,
      },
      NOW,
    ),
  ).rejects.toThrow(/per bet/i);
});

it("standard tier: rejects when outstanding cap would be exceeded", async () => {
  const m = await seedMatch(db);
  const line = await postLine(
    db,
    1,
    {
      matchId: m.id,
      market: "ah",
      favSide: "home",
      ballQ: 3,
      priceC: 92,
      priceOppC: -98,
    },
    NOW,
  );
  await placeBet(
    db,
    2,
    {
      matchId: m.id,
      market: "ah",
      lineVersion: line.version,
      side: "fav",
      stakeMmk: 500_000,
    },
    NOW,
  );
  const m2 = await seedMatch(db, { homeTeam: "ARG", awayTeam: "GER" });
  const l2 = await postLine(
    db,
    1,
    {
      matchId: m2.id,
      market: "ah",
      favSide: "home",
      ballQ: 3,
      priceC: 92,
      priceOppC: -98,
    },
    NOW,
  );
  await placeBet(
    db,
    2,
    {
      matchId: m2.id,
      market: "ah",
      lineVersion: l2.version,
      side: "fav",
      stakeMmk: 500_000,
    },
    NOW,
  );
  const m3 = await seedMatch(db, { homeTeam: "FRA", awayTeam: "ESP" });
  const l3 = await postLine(
    db,
    1,
    {
      matchId: m3.id,
      market: "ah",
      favSide: "home",
      ballQ: 3,
      priceC: 92,
      priceOppC: -98,
    },
    NOW,
  );
  await expect(
    placeBet(
      db,
      2,
      {
        matchId: m3.id,
        market: "ah",
        lineVersion: l3.version,
        side: "fav",
        stakeMmk: 10_000,
      },
      NOW,
    ),
  ).rejects.toThrow(/open bets/i);
});

it("standard tier: rejects more than max bets per match", async () => {
  const m = await seedMatch(db);
  const line = await postLine(
    db,
    1,
    {
      matchId: m.id,
      market: "ah",
      favSide: "home",
      ballQ: 3,
      priceC: 92,
      priceOppC: -98,
    },
    NOW,
  );
  await placeBet(
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
  );
  await placeBet(
    db,
    2,
    {
      matchId: m.id,
      market: "ah",
      lineVersion: line.version,
      side: "dog",
      stakeMmk: 50_000,
    },
    NOW,
  );
  await expect(
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
  ).rejects.toThrow(/per match/i);
});

it("pro tier: bypasses per-bet and outstanding caps", async () => {
  await db
    .update(schema.players)
    .set({ tier: "pro" })
    .where(eq(schema.players.id, 2));
  const m = await seedMatch(db);
  const line = await postLine(
    db,
    1,
    {
      matchId: m.id,
      market: "ah",
      favSide: "home",
      ballQ: 3,
      priceC: 92,
      priceOppC: -98,
    },
    NOW,
  );
  const bet = await placeBet(
    db,
    2,
    {
      matchId: m.id,
      market: "ah",
      lineVersion: line.version,
      side: "fav",
      stakeMmk: 5_000_000,
    },
    NOW,
  );
  expect(bet.stakeMmk).toBe(5_000_000);
});

it("recordBet bypasses tier caps", async () => {
  const m = await seedMatch(db);
  await postLine(
    db,
    1,
    {
      matchId: m.id,
      market: "ah",
      favSide: "home",
      ballQ: 3,
      priceC: 92,
      priceOppC: -98,
    },
    NOW,
  );
  const bet = await recordBet(
    db,
    1,
    {
      playerId: 2,
      matchId: m.id,
      market: "ah",
      side: "fav",
      stakeMmk: 9_000_000,
    },
    NOW,
  );
  expect(bet.stakeMmk).toBe(9_000_000);
});

it("pro still bound by the house daily pool", async () => {
  await db
    .update(schema.players)
    .set({ tier: "pro" })
    .where(eq(schema.players.id, 2));
  await db.update(schema.settings).set({ dailyTotalLimitMmk: 300_000 });
  const m = await seedMatch(db);
  const line = await postLine(
    db,
    1,
    {
      matchId: m.id,
      market: "ah",
      favSide: "home",
      ballQ: 3,
      priceC: 92,
      priceOppC: -98,
    },
    NOW,
  );
  await expect(
    placeBet(
      db,
      2,
      {
        matchId: m.id,
        market: "ah",
        lineVersion: line.version,
        side: "fav",
        stakeMmk: 400_000,
      },
      NOW,
    ),
  ).rejects.toThrow(/house can accept/i);
});
