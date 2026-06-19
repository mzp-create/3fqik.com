/**
 * Unit tests for the P&L and Balances report logic.
 *
 * These tests exercise the SQL queries used by the route handlers by running
 * them directly against a createTestDb() scenario with known fee data, then
 * asserting the expected aggregate values.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { and, eq, gte, isNotNull, isNull, lte, ne, sql } from "drizzle-orm";
import { createTestDb, schema, type Db } from "@/lib/db";
import { hashPin } from "@/lib/auth/pin";
import { postLine } from "@/lib/lines/manage";
import { recordBet } from "@/lib/bets/place";

// ─── Shared seed helpers ──────────────────────────────────────────────────────

const NOW = "2026-06-12T10:00:00Z";
const MATCH_DAY = "2026-06-12";

let db: Db;

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
      displayName: "Alice",
      createdAt: NOW,
    },
    {
      phone: "09700000003",
      pinHash: hashPin("333333"),
      displayName: "Bob",
      createdAt: NOW,
    },
  ]);
  // Settings: commission 3%, discount 2%
  await db
    .insert(schema.settings)
    .values({ id: 1, dailyTotalLimitMmk: 0, commissionPct: 3, discountPct: 2 });
  await db.insert(schema.matches).values({
    stage: "Group A",
    homeTeam: "BRA",
    awayTeam: "MEX",
    kickoffUtc: "2026-06-12T02:00:00Z",
    venue: "X",
    matchDay: MATCH_DAY,
  });
});

/**
 * Seed a graded bet with explicit netMmk and feeMmk (bypassing grade engine for
 * predictable values). Returns the bet row after update.
 */
async function seedGradedBet(
  playerId: number,
  stakeMmk: number,
  netMmk: number,
  feeMmk: number,
  settlementId: number | null = null,
) {
  const [match] = await db.select().from(schema.matches);
  const line = await postLine(
    db,
    1,
    {
      matchId: match.id,
      market: "ah",
      favSide: "home",
      ballQ: 4,
      priceC: 92,
    },
    NOW,
  );
  // Admin record path bypasses the started gate (match kickoff is in the past).
  // recordBet does not create the match_days row, so ensure it exists just as a
  // normal placement would have (tests below fetch this row).
  const [existingDay] = await db
    .select()
    .from(schema.matchDays)
    .where(eq(schema.matchDays.date, match.matchDay));
  if (!existingDay)
    await db.insert(schema.matchDays).values({ date: match.matchDay });
  const bet = await recordBet(
    db,
    1,
    {
      playerId,
      matchId: match.id,
      market: "ah",
      side: "fav",
      stakeMmk,
      scoreHomeAtBet: 0,
      scoreAwayAtBet: 0,
    },
    NOW,
  );
  // Suspend line so next bet creates a new version
  await db
    .update(schema.lines)
    .set({ status: "suspended" })
    .where(eq(schema.lines.id, line.id));
  // Directly write graded values
  await db
    .update(schema.bets)
    .set({
      status: netMmk >= 0 ? "won" : "lost",
      netMmk,
      feeMmk,
      settledAt: NOW,
      settlementId,
    })
    .where(eq(schema.bets.id, bet.id));
  return bet;
}

// ─── P&L report logic ────────────────────────────────────────────────────────

describe("P&L report query", () => {
  it("computes turnover, commission, discount, houseNet from known bets", async () => {
    /**
     * Scenario:
     *   Alice wins:  netMmk=+200_000, feeMmk=−6_000 (3% commission)
     *   Bob loses:   netMmk=−100_000, feeMmk=+2_000 (2% discount)
     *
     * Expected:
     *   turnover      = 300_000 (200k stake + 100k stake)
     *   grossWin      = (200_000 − 6_000) = +194_000   (eff net > 0)
     *   grossLoss     = (−100_000 + 2_000) = −98_000   (eff net < 0)
     *   commission    = 6_000
     *   discount      = 2_000
     *   playerNet     = 194_000 − 98_000 = +96_000
     *   houseNet      = −96_000
     */
    await seedGradedBet(2, 200_000, 200_000, -6_000); // Alice wins
    await seedGradedBet(3, 100_000, -100_000, 2_000); // Bob loses

    const from = MATCH_DAY;
    const to = MATCH_DAY;

    const rows = await db
      .select({
        stakeMmk: schema.bets.stakeMmk,
        netMmk: schema.bets.netMmk,
        feeMmk: schema.bets.feeMmk,
        playerId: schema.bets.playerId,
      })
      .from(schema.bets)
      .innerJoin(
        schema.matches,
        sql`${schema.bets.matchId} = ${schema.matches.id}`,
      )
      .where(
        and(
          ne(schema.bets.status, "void"),
          isNotNull(schema.bets.netMmk),
          gte(schema.matches.matchDay, from),
          lte(schema.matches.matchDay, to),
        ),
      );

    let turnover = 0;
    let grossWin = 0;
    let grossLoss = 0;
    let commission = 0;
    let discount = 0;
    const playerIds = new Set<number>();

    for (const r of rows) {
      turnover += r.stakeMmk;
      const net = r.netMmk ?? 0;
      const fee = r.feeMmk ?? 0;
      const effNet = net + fee;
      if (effNet > 0) grossWin += effNet;
      else if (effNet < 0) grossLoss += effNet;
      if (fee < 0) commission += -fee;
      else if (fee > 0) discount += fee;
      playerIds.add(r.playerId);
    }

    const playerNet = grossWin + grossLoss;
    const houseNet = -playerNet;

    expect(turnover).toBe(300_000);
    expect(grossWin).toBe(194_000);
    expect(grossLoss).toBe(-98_000);
    expect(commission).toBe(6_000);
    expect(discount).toBe(2_000);
    expect(playerNet).toBe(96_000);
    expect(houseNet).toBe(-96_000);
    expect(playerIds.size).toBe(2);
    expect(rows).toHaveLength(2);
  });

  it("excludes void bets from all aggregates", async () => {
    await seedGradedBet(2, 100_000, 100_000, -3_000); // valid win
    // Insert a void bet directly
    const [match] = await db.select().from(schema.matches);
    await postLine(
      db,
      1,
      {
        matchId: match.id,
        market: "ah",
        favSide: "home",
        ballQ: 4,
        priceC: 92,
      },
      NOW,
    );
    const voidBet = await recordBet(
      db,
      1,
      {
        playerId: 3,
        matchId: match.id,
        market: "ah",
        side: "fav",
        stakeMmk: 500_000,
        scoreHomeAtBet: 0,
        scoreAwayAtBet: 0,
      },
      NOW,
    );
    await db
      .update(schema.bets)
      .set({ status: "void" })
      .where(eq(schema.bets.id, voidBet.id));

    const rows = await db
      .select({ stakeMmk: schema.bets.stakeMmk })
      .from(schema.bets)
      .innerJoin(
        schema.matches,
        sql`${schema.bets.matchId} = ${schema.matches.id}`,
      )
      .where(
        and(ne(schema.bets.status, "void"), isNotNull(schema.bets.netMmk)),
      );

    const turnover = rows.reduce((s, r) => s + r.stakeMmk, 0);
    expect(turnover).toBe(100_000); // void 500k excluded
  });
});

// ─── Balances report logic ────────────────────────────────────────────────────

describe("Balances report query", () => {
  it("splits toPay / toCollect correctly with effective net", async () => {
    /**
     * Scenario:
     *   Alice: unsettled win  netMmk=+200_000 feeMmk=−6_000 → effNet=+194_000  (toPay)
     *   Bob:   unsettled loss netMmk=−100_000 feeMmk=+2_000 → effNet=−98_000   (toCollect)
     */
    await seedGradedBet(2, 200_000, 200_000, -6_000, null); // unsettled
    await seedGradedBet(3, 100_000, -100_000, 2_000, null); // unsettled

    const rows = await db
      .select({
        playerId: schema.bets.playerId,
        playerName: schema.players.displayName,
        unsettledNet:
          sql<number>`sum(${schema.bets.netMmk} + coalesce(${schema.bets.feeMmk}, 0))`.mapWith(
            Number,
          ),
      })
      .from(schema.bets)
      .innerJoin(
        schema.players,
        sql`${schema.bets.playerId} = ${schema.players.id}`,
      )
      .where(
        and(
          ne(schema.bets.status, "void"),
          isNotNull(schema.bets.netMmk),
          isNull(schema.bets.settlementId),
        ),
      )
      .groupBy(schema.bets.playerId, schema.players.displayName);

    let totalToPay = 0;
    let totalToCollect = 0;
    for (const r of rows) {
      const net = r.unsettledNet ?? 0;
      if (net > 0) totalToPay += net;
      else if (net < 0) totalToCollect += Math.abs(net);
    }

    expect(rows).toHaveLength(2);

    const alice = rows.find((r) => r.playerName === "Alice")!;
    expect(alice.unsettledNet).toBe(194_000);

    const bob = rows.find((r) => r.playerName === "Bob")!;
    expect(bob.unsettledNet).toBe(-98_000);

    expect(totalToPay).toBe(194_000);
    expect(totalToCollect).toBe(98_000);
  });

  it("settled bets (settlementId set) are excluded from unsettled totals", async () => {
    /**
     * Alice has a settled bet (settlementId = 1) and Bob has an unsettled bet.
     * Only Bob should appear in the unsettled query.
     *
     * Place bets first (match day must be open), then create the settlement
     * record and stamp settlementId on Alice's bet.
     */
    const aliceBet = await seedGradedBet(2, 200_000, 200_000, -6_000, null);
    await seedGradedBet(3, 100_000, -100_000, 2_000, null); // Bob unsettled

    // Now create the settlement record and link Alice's bet to it.
    // placeBet already inserted the match_days row; just fetch it.
    const [matchDay] = await db
      .select()
      .from(schema.matchDays)
      .where(eq(schema.matchDays.date, MATCH_DAY));
    const [settlement] = await db
      .insert(schema.settlements)
      .values({
        ref: "S-0612-01",
        matchDayId: matchDay.id,
        playerId: 2,
        netMmk: 194_000,
        markedBy: 1,
        markedAt: NOW,
      })
      .returning();
    await db
      .update(schema.bets)
      .set({ settlementId: settlement.id })
      .where(eq(schema.bets.id, aliceBet.id));

    const rows = await db
      .select({
        playerId: schema.bets.playerId,
        unsettledNet:
          sql<number>`sum(${schema.bets.netMmk} + coalesce(${schema.bets.feeMmk}, 0))`.mapWith(
            Number,
          ),
      })
      .from(schema.bets)
      .where(
        and(
          ne(schema.bets.status, "void"),
          isNotNull(schema.bets.netMmk),
          isNull(schema.bets.settlementId),
        ),
      )
      .groupBy(schema.bets.playerId);

    // Only Bob (playerId=3) should appear in unsettled
    expect(rows).toHaveLength(1);
    expect(rows[0].playerId).toBe(3);
    expect(rows[0].unsettledNet).toBe(-98_000);
  });

  it("a push (net=0) contributes zero to toPay and toCollect", async () => {
    await seedGradedBet(2, 100_000, 0, 0, null); // push

    const rows = await db
      .select({
        playerId: schema.bets.playerId,
        unsettledNet:
          sql<number>`sum(${schema.bets.netMmk} + coalesce(${schema.bets.feeMmk}, 0))`.mapWith(
            Number,
          ),
      })
      .from(schema.bets)
      .where(
        and(
          ne(schema.bets.status, "void"),
          isNotNull(schema.bets.netMmk),
          isNull(schema.bets.settlementId),
        ),
      )
      .groupBy(schema.bets.playerId);

    let totalToPay = 0;
    let totalToCollect = 0;
    for (const r of rows) {
      const net = r.unsettledNet ?? 0;
      if (net > 0) totalToPay += net;
      else if (net < 0) totalToCollect += Math.abs(net);
    }
    expect(totalToPay).toBe(0);
    expect(totalToCollect).toBe(0);
  });
});
