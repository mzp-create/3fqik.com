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
  );
  confirmFinalScore(db, 1, 1, 2, 0, NOW);
});

describe("getAllBets", () => {
  it("returns all bets with player name and match info", () => {
    const result = getAllBets(db, {});
    expect(result.rows).toHaveLength(1);
    const row = result.rows[0];
    expect(row.playerName).toBe("Zaw");
    expect(row.homeTeam).toBe("BRA");
    expect(row.awayTeam).toBe("MEX");
    expect(row.market).toBe("ah");
    expect(row.status).toBe("won");
    expect(result.capped).toBe(false);
  });

  it("filters by status=pending returns empty when bet is won", () => {
    const result = getAllBets(db, { status: "pending" });
    expect(result.rows).toHaveLength(0);
  });

  it("filters by status=won returns the won bet", () => {
    const result = getAllBets(db, { status: "won" });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].status).toBe("won");
  });

  it("filters by q matching player name (case-insensitive)", () => {
    const result = getAllBets(db, { q: "zaw" });
    expect(result.rows).toHaveLength(1);
    const resultNone = getAllBets(db, { q: "nobody" });
    expect(resultNone.rows).toHaveLength(0);
  });

  it("filters by q matching home team", () => {
    const result = getAllBets(db, { q: "bra" });
    expect(result.rows).toHaveLength(1);
  });

  it("resolves voidedBy to display_name", () => {
    const bet = db.select().from(schema.bets).get()!;
    voidTicket(db, 1, bet.ticketNo, "test void", NOW);
    const result = getAllBets(db, { status: "void" });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].voidedBy).toBe("Admin");
    expect(result.rows[0].voidReason).toBe("test void");
  });
});
