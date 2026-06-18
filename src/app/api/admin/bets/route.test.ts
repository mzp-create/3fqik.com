import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, schema, type Db } from "@/lib/db";
import { hashPin } from "@/lib/auth/pin";
import { postLine } from "@/lib/lines/manage";
import { placeBet } from "@/lib/bets/place";
import { confirmFinalScore } from "@/lib/bets/settleMatch";
import { voidTicket } from "@/lib/accounting/settle";
import { getAllBets, type BetsFilter } from "./route";

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
  const line = await postLine(
    db,
    1,
    {
      matchId: 1,
      market: "ah",
      favSide: "home",
      offeredSide: "fav",
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
      lineVersion: line.version,
      side: "fav",
      stakeMmk: 100_000,
    },
    NOW,
  );
  await confirmFinalScore(db, 1, 1, 2, 0, NOW);
});

describe("getAllBets", () => {
  it("returns all bets with player name and match info", async () => {
    const result = await getAllBets(db, {});
    expect(result.rows).toHaveLength(1);
    const row = result.rows[0];
    expect(row.playerName).toBe("Zaw");
    expect(row.homeTeam).toBe("BRA");
    expect(row.awayTeam).toBe("MEX");
    expect(row.market).toBe("ah");
    expect(row.status).toBe("won");
    expect(result.capped).toBe(false);
  });

  it("filters by status=pending returns empty when bet is won", async () => {
    const result = await getAllBets(db, { status: "pending" });
    expect(result.rows).toHaveLength(0);
  });

  it("filters by status=won returns the won bet", async () => {
    const result = await getAllBets(db, { status: "won" });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].status).toBe("won");
  });

  it("filters by q matching player name (case-insensitive)", async () => {
    const result = await getAllBets(db, { q: "zaw" });
    expect(result.rows).toHaveLength(1);
    const resultNone = await getAllBets(db, { q: "nobody" });
    expect(resultNone.rows).toHaveLength(0);
  });

  it("filters by q matching home team", async () => {
    const result = await getAllBets(db, { q: "bra" });
    expect(result.rows).toHaveLength(1);
  });

  it("resolves voidedBy to display_name", async () => {
    const [bet] = await db.select().from(schema.bets);
    await voidTicket(db, 1, bet.ticketNo, "test void", NOW);
    const result = await getAllBets(db, { status: "void" });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].voidedBy).toBe("Admin");
    expect(result.rows[0].voidReason).toBe("test void");
  });
});
