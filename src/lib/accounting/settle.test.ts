import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, schema, type Db } from "@/lib/db";
import { hashPin } from "@/lib/auth/pin";
import { postLine } from "@/lib/lines/manage";
import { placeBet } from "@/lib/bets/place";
import { confirmFinalScore } from "@/lib/bets/settleMatch";
import { dayBoard, playerDayItems } from "./queries";
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
