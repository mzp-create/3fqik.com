import { it, expect, beforeEach } from "vitest";
import { createTestDb, schema, type Db } from "@/lib/db";
import { hashPin } from "@/lib/auth/pin";
import { postLine } from "@/lib/lines/manage";
import { placeBet } from "@/lib/bets/place";
import { confirmFinalScore } from "@/lib/bets/settleMatch";
import { dashboard } from "./dashboard";

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
  const line = await postLine(
    db,
    1,
    { matchId: 1, market: "ah", favSide: "home", ballQ: 2, priceC: 90 },
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
  ); // Zaw fav
  await placeBet(
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
  // Malay: line ballQ=2 (N=0.5), priceC=+90. BRA 2-0 → margin=2 > 0.5.
  //   Zaw fav WIN  → +0.90×100k = +90,000
  //   Thiri dog LOSE → priceC>0 → −S = −200,000
  await confirmFinalScore(db, 1, 1, 2, 0, NOW);
});

it("aggregates volume, exposure, and house P&L", async () => {
  const d = await dashboard(db, "2026-06-12");
  // Zaw effective +87,300 (net +90k, fee -2.7k), Thiri effective -196k (net -200k, fee +4k)
  //     house net = -(87,300 + (-196,000)) = +108,700
  expect(d.todayHouseNet).toBe(108_700);
  expect(d.tournamentHouseNet).toBe(108_700);
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

it("includes outstanding settlements: effective nets applied", async () => {
  const d = await dashboard(db, "2026-06-12");
  expect(d.outstanding).toBeDefined();
  // Zaw effective +87,300 (commission 3%), Thiri effective -196k (discount 2%)
  expect(d.outstanding.toPayMmk).toBe(87_300);
  expect(d.outstanding.toCollectMmk).toBe(196_000);
  expect(d.outstanding.payCount).toBe(1);
  expect(d.outstanding.collectCount).toBe(1);
});
