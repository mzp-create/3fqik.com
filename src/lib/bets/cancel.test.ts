import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, schema, type Db } from "@/lib/db";
import { hashPin } from "@/lib/auth/pin";
import { postLine } from "@/lib/lines/manage";
import { placeBet } from "./place";
import { cancelOwnBet } from "./cancel";

let db: Db;
const PLACED = "2026-06-12T10:00:00Z";
const WINDOW = 180;

async function setup() {
  db = await createTestDb();
  await db.insert(schema.players).values([
    {
      phone: "09700000001",
      pinHash: hashPin("111111"),
      displayName: "Admin",
      role: "admin",
      createdAt: PLACED,
    },
    {
      phone: "09700000002",
      pinHash: hashPin("222222"),
      displayName: "Zaw",
      createdAt: PLACED,
    },
  ]);
  await db.insert(schema.settings).values({ id: 1, dailyTotalLimitMmk: 0 });
  const [m] = await db
    .insert(schema.matches)
    .values({
      stage: "Group C",
      homeTeam: "BRA",
      awayTeam: "MEX",
      kickoffUtc: "2026-06-12T20:00:00Z",
      venue: "X",
      matchDay: "2026-06-12",
      // default status 'scheduled'
    })
    .returning();
  const line = await postLine(
    db,
    1,
    { matchId: m.id, market: "ah", favSide: "home", ballQ: 3, priceC: 92 },
    PLACED,
  );
  // player id 2 places a bet
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
    PLACED,
  );
  return { m, bet };
}

describe("cancelOwnBet", () => {
  it("cancels a pending bet within window, before kickoff, line unchanged", async () => {
    const { bet } = await setup();
    const res = await cancelOwnBet(
      db,
      2,
      bet.ticketNo,
      "2026-06-12T10:01:00Z", // +60s
      WINDOW,
    );
    expect(res.status).toBe("void");
    const [row] = await db
      .select()
      .from(schema.bets)
      .where(eq(schema.bets.ticketNo, bet.ticketNo));
    expect(row.status).toBe("void");
    expect(row.netMmk).toBeNull();
    expect(row.voidedBy).toBe(2);
    // audit row written
    const audit = await db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.subject, `ticket:${bet.ticketNo}`));
    expect(audit[0]?.action).toBe("cancel");
  });

  it("rejects after the window passes", async () => {
    const { bet } = await setup();
    await expect(
      cancelOwnBet(db, 2, bet.ticketNo, "2026-06-12T10:05:00Z", WINDOW), // +300s
    ).rejects.toMatchObject({ code: "window_passed" });
  });

  it("rejects once the match has kicked off", async () => {
    const { m, bet } = await setup();
    await db
      .update(schema.matches)
      .set({ status: "live" })
      .where(eq(schema.matches.id, m.id));
    await expect(
      cancelOwnBet(db, 2, bet.ticketNo, "2026-06-12T10:01:00Z", WINDOW),
    ).rejects.toMatchObject({ code: "match_started" });
  });

  it("rejects when the line has moved", async () => {
    const { m, bet } = await setup();
    await postLine(
      db,
      1,
      { matchId: m.id, market: "ah", favSide: "home", ballQ: 4, priceC: 90 },
      "2026-06-12T10:00:30Z",
    );
    await expect(
      cancelOwnBet(db, 2, bet.ticketNo, "2026-06-12T10:01:00Z", WINDOW),
    ).rejects.toMatchObject({ code: "line_moved" });
  });

  it("rejects cancelling someone else's ticket", async () => {
    const { bet } = await setup();
    await expect(
      cancelOwnBet(db, 1, bet.ticketNo, "2026-06-12T10:01:00Z", WINDOW),
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("rejects a second cancel (already void)", async () => {
    const { bet } = await setup();
    await cancelOwnBet(db, 2, bet.ticketNo, "2026-06-12T10:01:00Z", WINDOW);
    await expect(
      cancelOwnBet(db, 2, bet.ticketNo, "2026-06-12T10:01:30Z", WINDOW),
    ).rejects.toMatchObject({ code: "not_cancellable" });
  });
});
