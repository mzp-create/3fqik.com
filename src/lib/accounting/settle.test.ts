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
      {
        phone: "09700000003",
        pinHash: hashPin("333333"),
        displayName: "Thiri",
        createdAt: NOW,
      },
    ])
    .run();
  db.insert(schema.settings).values({ id: 1, dailyTotalLimitMmk: 0 }).run();
  db.insert(schema.matches)
    .values({
      stage: "Group C",
      homeTeam: "BRA",
      awayTeam: "MEX",
      kickoffUtc: "2026-06-12T02:00:00Z",
      venue: "X",
      matchDay: "2026-06-12",
    })
    .run();
  const line = postLine(
    db,
    1,
    { matchId: 1, market: "ah", favSide: "home", ballQ: 2, priceC: 90 },
    NOW,
  );
  placeBet(
    db,
    2,
    {
      matchId: 1,
      market: "ah",
      lineVersion: line.version,
      side: "fav",
      stakeMmk: 100_000,
    },
    NOW,
  ); // Zaw fav
  placeBet(
    db,
    3,
    {
      matchId: 1,
      market: "ah",
      lineVersion: line.version,
      side: "dog",
      stakeMmk: 200_000,
    },
    NOW,
  ); // Thiri dog
  confirmFinalScore(db, 1, 1, 2, 0, NOW); // BRA -0.5 covers → Zaw +90,000, Thiri −200,000
});

it("board shows nets and ticket items; marking paid stamps ref onto tickets", () => {
  const board = dayBoard(db, "2026-06-12");
  expect(board.day.status).toBe("closed");
  expect(board.rows).toEqual([
    expect.objectContaining({ playerId: 2, netMmk: 90_000, ticketCount: 1 }),
    expect.objectContaining({ playerId: 3, netMmk: -200_000, ticketCount: 1 }),
  ]);
  expect(board.houseNet).toBe(110_000);

  const s1 = markPlayerPaid(db, 1, "2026-06-12", 2, NOW);
  expect(s1.ref).toBe("S-0612-01");
  const s2 = markPlayerPaid(db, 1, "2026-06-12", 3, NOW);
  expect(s2.ref).toBe("S-0612-02");
  // every covered ticket stamped
  const zawItems = playerDayItems(db, 2, "2026-06-12");
  expect(zawItems[0].settlementId).toBe(s1.id);
  // all players paid → day settled
  expect(db.select().from(schema.matchDays).all()[0].status).toBe("settled");
  // double-pay rejected
  expect(() => markPlayerPaid(db, 1, "2026-06-12", 2, NOW)).toThrow(/already/);
});

it("cannot mark paid while day open; void excludes ticket from accounting", () => {
  db.update(schema.matchDays).set({ status: "open" }).run();
  expect(() => markPlayerPaid(db, 1, "2026-06-12", 2, NOW)).toThrow(
    /not closed/,
  );
  db.update(schema.matchDays).set({ status: "closed" }).run();

  const ticket = db
    .select()
    .from(schema.bets)
    .where(eq(schema.bets.playerId, 2))
    .get()!;
  voidTicket(db, 1, ticket.ticketNo, "admin error", NOW);
  const board = dayBoard(db, "2026-06-12");
  expect(board.rows.find((r) => r.playerId === 2)).toBeUndefined();
  expect(
    db
      .select()
      .from(schema.auditLog)
      .all()
      .some((a) => a.action === "void"),
  ).toBe(true);
});

// --- stuck-day regression: pay A then void B's only ticket → day settled ---
it("stuck-day regression: pay A then void B's only ticket settles the day", () => {
  // Pay Zaw (player 2)
  markPlayerPaid(db, 1, "2026-06-12", 2, NOW);
  // Day should still be closed (Thiri not paid yet)
  expect(db.select().from(schema.matchDays).all()[0].status).toBe("closed");

  // Void Thiri's (player 3) only ticket
  const thiriTicket = db
    .select()
    .from(schema.bets)
    .where(eq(schema.bets.playerId, 3))
    .get()!;
  voidTicket(db, 1, thiriTicket.ticketNo, "admin error", NOW);

  // After void, the board has only Zaw who is settled → day should auto-settle
  expect(db.select().from(schema.matchDays).all()[0].status).toBe("settled");
});

// --- order symmetry: void B first, then pay A → day settled ---
it("order symmetry: void B's only ticket first then pay A settles the day", () => {
  // Void Thiri's (player 3) only ticket first
  const thiriTicket = db
    .select()
    .from(schema.bets)
    .where(eq(schema.bets.playerId, 3))
    .get()!;
  voidTicket(db, 1, thiriTicket.ticketNo, "admin error", NOW);

  // Day should still be closed
  expect(db.select().from(schema.matchDays).all()[0].status).toBe("closed");

  // Now pay Zaw (player 2) — the only remaining player on board
  markPlayerPaid(db, 1, "2026-06-12", 2, NOW);

  // Day should now be settled
  expect(db.select().from(schema.matchDays).all()[0].status).toBe("settled");
});

// --- void-after-paid: pay A then voidTicket on A's stamped ticket → throws /settled/ ---
it("void-after-paid: voiding an already-stamped ticket throws", () => {
  markPlayerPaid(db, 1, "2026-06-12", 2, NOW);
  const zawTicket = db
    .select()
    .from(schema.bets)
    .where(eq(schema.bets.playerId, 2))
    .get()!;
  expect(() =>
    voidTicket(db, 1, zawTicket.ticketNo, "should fail", NOW),
  ).toThrow(/settled/);
});

// --- DB backstop: after paying A, raw insert same (matchDayId, playerId) → throws /UNIQUE/ ---
it("DB backstop: duplicate settlement insert throws UNIQUE constraint", () => {
  const s1 = markPlayerPaid(db, 1, "2026-06-12", 2, NOW);
  const day = db.select().from(schema.matchDays).all()[0];
  expect(() =>
    db
      .insert(schema.settlements)
      .values({
        ref: "S-0612-99",
        matchDayId: day.id,
        playerId: 2,
        netMmk: 0,
        markedBy: 1,
        markedAt: NOW,
      })
      .run(),
  ).toThrow(/UNIQUE/);
  expect(s1).toBeDefined();
});

// --- no-tickets 404: markPlayerPaid for player with no tickets that day → throws /no tickets/ ---
it("no-tickets 404: markPlayerPaid for player with no tickets throws", () => {
  // Player 1 is admin and has no bets
  expect(() => markPlayerPaid(db, 1, "2026-06-12", 1, NOW)).toThrow(
    /no tickets/,
  );
});

// ─── outstandingSettlements ───────────────────────────────────────────────

describe("outstandingSettlements", () => {
  it("basic: payCount=1(+90k), collectCount=1(-200k), settled and void excluded", () => {
    // beforeEach has: Zaw +90,000 unsettled, Thiri -200,000 unsettled
    const r = outstandingSettlements(db);
    expect(r.toPayMmk).toBe(90_000);
    expect(r.toCollectMmk).toBe(200_000);
    expect(r.payCount).toBe(1);
    expect(r.collectCount).toBe(1);
  });

  it("settled unit is excluded", () => {
    // Mark Zaw paid → his day1 unit is now settled
    markPlayerPaid(db, 1, "2026-06-12", 2, NOW);
    const r = outstandingSettlements(db);
    // Zaw's +90k unit is settled → only Thiri remains
    expect(r.toPayMmk).toBe(0);
    expect(r.toCollectMmk).toBe(200_000);
    expect(r.payCount).toBe(0);
    expect(r.collectCount).toBe(1);
  });

  it("void bet is excluded from units", () => {
    // Void Thiri's ticket → her unit disappears
    const thiriTicket = db
      .select()
      .from(schema.bets)
      .where(eq(schema.bets.playerId, 3))
      .get()!;
    voidTicket(db, 1, thiriTicket.ticketNo, "test", NOW);
    const r = outstandingSettlements(db);
    expect(r.toPayMmk).toBe(90_000);
    expect(r.toCollectMmk).toBe(0);
    expect(r.payCount).toBe(1);
    expect(r.collectCount).toBe(0);
  });

  it("push (net==0) unit contributes to neither pay nor collect", () => {
    // Insert a push bet directly: net_mmk = 0, settlement_id = null, status != void
    // Use a second match on the same day
    db.insert(schema.matches)
      .values({
        stage: "Group D",
        homeTeam: "ARG",
        awayTeam: "POL",
        kickoffUtc: "2026-06-12T05:00:00Z",
        venue: "Y",
        matchDay: "2026-06-12",
      })
      .run();
    const match2 = db
      .select()
      .from(schema.matches)
      .where(eq(schema.matches.homeTeam, "ARG"))
      .get()!;
    // Insert a line first (required FK)
    const line2 = postLine(
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
    db.insert(schema.bets)
      .values({
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
      })
      .run();
    const r = outstandingSettlements(db);
    // Zaw has two units: day1 +90k and day1 push(0). The push contributes nothing.
    // But wait — both push bet and original bet are on day "2026-06-12" for player 2.
    // They GROUP into ONE unit: net = 90000 + 0 = 90000 (still pay).
    // That's fine — let's verify counts are still 1 pay, 1 collect.
    expect(r.payCount).toBe(1);
    expect(r.collectCount).toBe(1);
    expect(r.toPayMmk).toBe(90_000);
  });

  it("two match-days for player A: appears as separate (player,day) units", () => {
    // Add a second match day with Zaw net -150,000
    db.insert(schema.matches)
      .values({
        stage: "Group D",
        homeTeam: "ARG",
        awayTeam: "POL",
        kickoffUtc: "2026-06-13T05:00:00Z",
        venue: "Y",
        matchDay: "2026-06-13",
      })
      .run();
    const match2 = db
      .select()
      .from(schema.matches)
      .where(eq(schema.matches.matchDay, "2026-06-13"))
      .get()!;
    const line2 = postLine(
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
    db.insert(schema.bets)
      .values({
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
      })
      .run();
    const r = outstandingSettlements(db);
    // Units: (Zaw, day1) = +90k → pay, (Zaw, day2) = -150k → collect, (Thiri, day1) = -200k → collect
    expect(r.payCount).toBe(1);
    expect(r.collectCount).toBe(2);
    expect(r.toPayMmk).toBe(90_000);
    expect(r.toCollectMmk).toBe(350_000); // 150k + 200k
  });
});
