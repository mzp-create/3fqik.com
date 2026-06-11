import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, schema, type Db } from "@/lib/db";
import { hashPin } from "@/lib/auth/pin";
import { postLine } from "@/lib/lines/manage";
import { placeBet } from "@/lib/bets/place";
import { confirmFinalScore } from "@/lib/bets/settleMatch";
import { dashboard } from "./dashboard";

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
    { matchId: 1, favSide: "home", ballQ: 2, priceC: 90 },
    NOW,
  );
  placeBet(
    db,
    2,
    { matchId: 1, lineVersion: line.version, side: "fav", stakeMmk: 100_000 },
    NOW,
  ); // Zaw fav
  placeBet(
    db,
    3,
    { matchId: 1, lineVersion: line.version, side: "dog", stakeMmk: 200_000 },
    NOW,
  ); // Thiri dog
  confirmFinalScore(db, 1, 1, 2, 0, NOW); // BRA -0.5 covers → Zaw +90,000, Thiri −200,000
});

it("aggregates volume, exposure, and house P&L", () => {
  const d = dashboard(db, "2026-06-12");
  expect(d.todayHouseNet).toBe(110_000);
  expect(d.tournamentHouseNet).toBe(110_000);
  expect(d.todayStakeVolume).toBe(300_000);
  expect(d.todayBetCount).toBe(2);
  expect(d.activePlayers).toBe(2);
  expect(d.matches[0]).toEqual(
    expect.objectContaining({
      matchId: 1,
      stakeVolume: 300_000,
      betCount: 2,
    }),
  );
});
