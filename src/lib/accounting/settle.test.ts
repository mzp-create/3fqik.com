import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, schema, type Db } from "@/lib/db";
import { hashPin } from "@/lib/auth/pin";
import { postLine } from "@/lib/lines/manage";
import { placeBet } from "@/lib/bets/place";
import { confirmFinalScore } from "@/lib/bets/settleMatch";
import { dayBoard, playerDayItems, outstandingSettlements } from "./queries";
import { markPlayerPaid, voidTicket } from "./settle";
import { eq } from "drizzle-orm";

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
    {
      phone: "09700000003",
      pinHash: hashPin("333333"),
      displayName: "Thiri",
      createdAt: NOW,
    },
  ]);
  await db.insert(schema.settings).values({ id: 1, dailyTotalLimitMmk: 0 });
  await db.insert(schema.matches).values({
    stage: "Group C",
    homeTeam: "BRA",
    awayTeam: "MEX",
    kickoffUtc: "2026-06-12T02:00:00Z",
    venue: "X",
    matchDay: "2026-06-12",
  });
  const favLine = await postLine(
    db,
    1,
    {
      matchId: 1,
      market: "ah",
      favSide: "home",
      ballQ: 2,
      priceC: 90,
    },
    NOW,
  );
  await placeBet(
    db,
    2,
    {
      matchId: 1,
      market: "ah",
      lineVersion: favLine.version,
      side: "fav",
      stakeMmk: 100_000,
    },
    NOW,
  ); // Zaw fav
  // re-post offering dog (same ballQ/priceC → same grading) for Thiri's dog bet
  const dogLine = await postLine(
    db,
    1,
    {
      matchId: 1,
      market: "ah",
      favSide: "home",
      ballQ: 2,
      priceC: 90,
    },
    NOW,
  );
  await placeBet(
    db,
    3,
    {
      matchId: 1,
      market: "ah",
      lineVersion: dogLine.version,
      side: "dog",
      stakeMmk: 200_000,
    },
    NOW,
  ); // Thiri dog
  // Malay: line ballQ=2 (N=0.5), priceC=+90. BRA 2-0 → margin=2 > 0.5.
  //   Zaw fav WIN  → +0.90×100k = +90,000
  //   Thiri dog LOSE → priceC>0 → −S = −200,000
  await confirmFinalScore(db, 1, 1, 2, 0, NOW);
});

it("board shows nets and ticket items; marking paid stamps ref onto tickets", async () => {
  const board = await dayBoard(db, "2026-06-12");
  expect(board.day.status).toBe("closed");
  // Fees: Zaw fav wins gross +90,000; commission = -3% × 90k = -2,700 → effective +87,300
  //       Thiri dog loses gross -200,000; discount = +2% × 200k = +4,000 → effective -196,000
  //       houseNet = -(87,300 + (-196,000)) = +108,700
  expect(board.rows).toEqual([
    expect.objectContaining({ playerId: 2, netMmk: 87_300, ticketCount: 1 }),
    expect.objectContaining({ playerId: 3, netMmk: -196_000, ticketCount: 1 }),
  ]);
  expect(board.houseNet).toBe(108_700);

  const s1 = await markPlayerPaid(db, 1, "2026-06-12", 2, NOW);
  expect(s1.ref).toBe("S-0612-01");
  const s2 = await markPlayerPaid(db, 1, "2026-06-12", 3, NOW);
  expect(s2.ref).toBe("S-0612-02");
  // every covered ticket stamped
  const zawItems = await playerDayItems(db, 2, "2026-06-12");
  expect(zawItems[0].settlementId).toBe(s1.id);
  // all players paid → day settled
  expect((await db.select().from(schema.matchDays))[0].status).toBe("settled");
  // double-pay rejected
  await expect(markPlayerPaid(db, 1, "2026-06-12", 2, NOW)).rejects.toThrow(
    /already/,
  );
});

it("cannot mark paid while day open; void excludes ticket from accounting", async () => {
  await db.update(schema.matchDays).set({ status: "open" });
  await expect(markPlayerPaid(db, 1, "2026-06-12", 2, NOW)).rejects.toThrow(
    /not closed/,
  );
  await db.update(schema.matchDays).set({ status: "closed" });

  const [ticket] = await db
    .select()
    .from(schema.bets)
    .where(eq(schema.bets.playerId, 2));
  await voidTicket(db, 1, ticket.ticketNo, "admin error", NOW);
  const board = await dayBoard(db, "2026-06-12");
  expect(board.rows.find((r) => r.playerId === 2)).toBeUndefined();
  expect(
    (await db.select().from(schema.auditLog)).some((a) => a.action === "void"),
  ).toBe(true);
});

// --- stuck-day regression: pay A then void B's only ticket → day settled ---
it("stuck-day regression: pay A then void B's only ticket settles the day", async () => {
  // Pay Zaw (player 2)
  await markPlayerPaid(db, 1, "2026-06-12", 2, NOW);
  // Day should still be closed (Thiri not paid yet)
  expect((await db.select().from(schema.matchDays))[0].status).toBe("closed");

  // Void Thiri's (player 3) only ticket
  const [thiriTicket] = await db
    .select()
    .from(schema.bets)
    .where(eq(schema.bets.playerId, 3));
  await voidTicket(db, 1, thiriTicket.ticketNo, "admin error", NOW);

  // After void, the board has only Zaw who is settled → day should auto-settle
  expect((await db.select().from(schema.matchDays))[0].status).toBe("settled");
});

// --- order symmetry: void B first, then pay A → day settled ---
it("order symmetry: void B's only ticket first then pay A settles the day", async () => {
  // Void Thiri's (player 3) only ticket first
  const [thiriTicket] = await db
    .select()
    .from(schema.bets)
    .where(eq(schema.bets.playerId, 3));
  await voidTicket(db, 1, thiriTicket.ticketNo, "admin error", NOW);

  // Day should still be closed
  expect((await db.select().from(schema.matchDays))[0].status).toBe("closed");

  // Now pay Zaw (player 2) — the only remaining player on board
  await markPlayerPaid(db, 1, "2026-06-12", 2, NOW);

  // Day should now be settled
  expect((await db.select().from(schema.matchDays))[0].status).toBe("settled");
});

// --- void-after-paid: pay A then voidTicket on A's stamped ticket → throws /settled/ ---
it("void-after-paid: voiding an already-stamped ticket throws", async () => {
  await markPlayerPaid(db, 1, "2026-06-12", 2, NOW);
  const [zawTicket] = await db
    .select()
    .from(schema.bets)
    .where(eq(schema.bets.playerId, 2));
  await expect(
    voidTicket(db, 1, zawTicket.ticketNo, "should fail", NOW),
  ).rejects.toThrow(/settled/);
});

// --- DB backstop: after paying A, raw insert same (matchDayId, playerId) → throws /UNIQUE/ ---
it("DB backstop: duplicate settlement insert throws UNIQUE constraint", async () => {
  const s1 = await markPlayerPaid(db, 1, "2026-06-12", 2, NOW);
  const [day] = await db.select().from(schema.matchDays);
  await expect(
    db.insert(schema.settlements).values({
      ref: "S-0612-99",
      matchDayId: day.id,
      playerId: 2,
      netMmk: 0,
      markedBy: 1,
      markedAt: NOW,
    }),
  ).rejects.toMatchObject({ cause: { code: "23505" } }); // unique_violation
  expect(s1).toBeDefined();
});

// --- no-tickets 404: markPlayerPaid for player with no tickets that day → throws /no tickets/ ---
it("no-tickets 404: markPlayerPaid for player with no tickets throws", async () => {
  // Player 1 is admin and has no bets
  await expect(markPlayerPaid(db, 1, "2026-06-12", 1, NOW)).rejects.toThrow(
    /no tickets/,
  );
});

// ─── outstandingSettlements ───────────────────────────────────────────────

describe("outstandingSettlements", () => {
  it("basic: payCount=1(+100k), collectCount=1(-200k), settled and void excluded", async () => {
    // Zaw effective +87,300 unsettled, Thiri effective -196,000 unsettled
    const r = await outstandingSettlements(db);
    expect(r.toPayMmk).toBe(87_300);
    expect(r.toCollectMmk).toBe(196_000);
    expect(r.payCount).toBe(1);
    expect(r.collectCount).toBe(1);
  });

  it("settled unit is excluded", async () => {
    // Mark Zaw paid → his day1 unit is now settled
    await markPlayerPaid(db, 1, "2026-06-12", 2, NOW);
    const r = await outstandingSettlements(db);
    // Zaw's effective +87,300 unit is settled → only Thiri remains (effective -196k)
    expect(r.toPayMmk).toBe(0);
    expect(r.toCollectMmk).toBe(196_000);
    expect(r.payCount).toBe(0);
    expect(r.collectCount).toBe(1);
  });

  it("void bet is excluded from units", async () => {
    // Void Thiri's ticket → her unit disappears
    const [thiriTicket] = await db
      .select()
      .from(schema.bets)
      .where(eq(schema.bets.playerId, 3));
    await voidTicket(db, 1, thiriTicket.ticketNo, "test", NOW);
    const r = await outstandingSettlements(db);
    // Zaw effective +87,300 remains; Thiri voided → 0
    expect(r.toPayMmk).toBe(87_300);
    expect(r.toCollectMmk).toBe(0);
    expect(r.payCount).toBe(1);
    expect(r.collectCount).toBe(0);
  });

  it("push (net==0) unit contributes to neither pay nor collect", async () => {
    // Insert a push bet directly: net_mmk = 0, settlement_id = null, status != void
    // Use a second match on the same day
    await db.insert(schema.matches).values({
      stage: "Group D",
      homeTeam: "ARG",
      awayTeam: "POL",
      kickoffUtc: "2026-06-12T05:00:00Z",
      venue: "Y",
      matchDay: "2026-06-12",
    });
    const [match2] = await db
      .select()
      .from(schema.matches)
      .where(eq(schema.matches.homeTeam, "ARG"));
    // Insert a line first (required FK)
    const line2 = await postLine(
      db,
      1,
      {
        matchId: match2.id,
        market: "ah",
        favSide: "home",
        ballQ: 4,
        priceC: 90,
      },
      NOW,
    );
    // Insert a push bet directly with net_mmk=0
    await db.insert(schema.bets).values({
      ticketNo: "T-PUSH-001",
      playerId: 2,
      matchId: match2.id,
      lineId: line2.id,
      side: "fav",
      stakeMmk: 50_000,
      scoreHomeAtBet: 0,
      scoreAwayAtBet: 0,
      placedAt: NOW,
      status: "push",
      netMmk: 0,
      settlementId: null,
    });
    const r = await outstandingSettlements(db);
    // Zaw has two bets on day "2026-06-12":
    //   - original: effective +87,300 (net +90k + fee -2.7k)
    //   - push:     feeMmk=null → effective 0 (coalesce 0)
    // They GROUP into ONE unit: net = 87,300 + 0 = 87,300 (still pay).
    // Thiri effective -196,000 still collect.
    expect(r.payCount).toBe(1);
    expect(r.collectCount).toBe(1);
    expect(r.toPayMmk).toBe(87_300);
  });

  it("two match-days for player A: appears as separate (player,day) units", async () => {
    // Add a second match day with Zaw net -150,000
    await db.insert(schema.matches).values({
      stage: "Group D",
      homeTeam: "ARG",
      awayTeam: "POL",
      kickoffUtc: "2026-06-13T05:00:00Z",
      venue: "Y",
      matchDay: "2026-06-13",
    });
    const [match2] = await db
      .select()
      .from(schema.matches)
      .where(eq(schema.matches.matchDay, "2026-06-13"));
    const line2 = await postLine(
      db,
      1,
      {
        matchId: match2.id,
        market: "ah",
        favSide: "home",
        ballQ: 4,
        priceC: 90,
      },
      NOW,
    );
    // Zaw bets dog on day2, loses → net = -150000
    await db.insert(schema.bets).values({
      ticketNo: "T-DAY2-001",
      playerId: 2,
      matchId: match2.id,
      lineId: line2.id,
      side: "dog",
      stakeMmk: 150_000,
      scoreHomeAtBet: 0,
      scoreAwayAtBet: 0,
      placedAt: NOW,
      status: "lost",
      netMmk: -150_000,
      settlementId: null,
    });
    const r = await outstandingSettlements(db);
    // Effective nets:
    //   (Zaw, day1)   = +87,300  (net +90k, fee -2.7k) → pay
    //   (Zaw, day2)   = -150,000 (direct insert, feeMmk null → +0) → collect
    //   (Thiri, day1) = -196,000 (net -200k, fee +4k) → collect
    expect(r.payCount).toBe(1);
    expect(r.collectCount).toBe(2);
    expect(r.toPayMmk).toBe(87_300);
    expect(r.toCollectMmk).toBe(346_000); // 150k + 196k
  });
});
