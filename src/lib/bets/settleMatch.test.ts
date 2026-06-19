import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, schema, type Db } from "@/lib/db";
import { hashPin } from "@/lib/auth/pin";
import { postLine } from "@/lib/lines/manage";
import { recordBet } from "./place";
import { confirmFinalScore, correctScore } from "./settleMatch";
import { eq } from "drizzle-orm";
import { sseHub } from "@/lib/sse";

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
  await db.insert(schema.matches).values([
    {
      stage: "Group C",
      homeTeam: "BRA",
      awayTeam: "MEX",
      kickoffUtc: "2026-06-12T02:00:00Z",
      venue: "X",
      matchDay: "2026-06-12",
    },
    {
      stage: "Group D",
      homeTeam: "USA",
      awayTeam: "JPN",
      kickoffUtc: "2026-06-12T05:00:00Z",
      venue: "Y",
      matchDay: "2026-06-12",
    },
  ]);
});

async function bet(matchId: number, side: "fav" | "dog", stake: number) {
  await postLine(
    db,
    1,
    {
      matchId,
      market: "ah",
      favSide: "home",
      ballQ: 3,
      priceC: 92,
    },
    NOW,
  );
  // Admin record path bypasses the started gate. Mirror the old placeBet
  // snapshot semantics: score-at-bet = the match's CURRENT score. recordBet
  // also bypasses match-day creation, so ensure the (open) matchDays row exists
  // just as a normal placement would have, keeping day-close assertions intact.
  const [m] = await db
    .select()
    .from(schema.matches)
    .where(eq(schema.matches.id, matchId));
  const [existingDay] = await db
    .select()
    .from(schema.matchDays)
    .where(eq(schema.matchDays.date, m.matchDay));
  if (!existingDay)
    await db.insert(schema.matchDays).values({ date: m.matchDay });
  return recordBet(
    db,
    1,
    {
      playerId: 2,
      matchId,
      market: "ah",
      side,
      stakeMmk: stake,
      scoreHomeAtBet: m.homeScore ?? 0,
      scoreAwayAtBet: m.awayScore ?? 0,
    },
    NOW,
  );
}

it("grades all pending tickets; closes the day when last match graded", async () => {
  const b1 = await bet(1, "fav", 100_000); // BRA -0.75 @ +0.92
  const b2 = await bet(2, "dog", 200_000); // JPN +0.75 @ +0.92
  // Malay: BRA 2-1 → effFav=2,effDog=1 → margin=1 > N=0.75 → fav WIN.
  //        priceC=+92 → +0.92×100k = +92,000
  await confirmFinalScore(db, 1, 1, 2, 1, NOW);
  let day = (await db.select().from(schema.matchDays))[0];
  expect(day.status).toBe("open"); // match 2 not graded yet
  const [g1] = await db
    .select()
    .from(schema.bets)
    .where(eq(schema.bets.id, b1.id));
  expect(g1.status).toBe("won");
  expect(g1.netMmk).toBe(92_000);

  // Malay: draw 0-0 → effFav=0,effDog=0 → margin=0 < N=0.75 → dog WIN.
  //        priceC=+92 → +0.92×200k = +184,000
  await confirmFinalScore(db, 1, 2, 0, 0, NOW);
  const [g2] = await db
    .select()
    .from(schema.bets)
    .where(eq(schema.bets.id, b2.id));
  expect(g2.status).toBe("won");
  expect(g2.netMmk).toBe(184_000);
  day = (await db.select().from(schema.matchDays))[0];
  expect(day.status).toBe("closed");
});

it("live bets grade on effective score", async () => {
  await db
    .update(schema.matches)
    .set({ status: "live", homeScore: 1, awayScore: 0 })
    .where(eq(schema.matches.id, 1));
  const b = await bet(1, "dog", 100_000); // MEX +0.75 at 1-0
  // Malay: eff 1-1 → margin=0 < N=0.75 → dog WIN. priceC=+92 → +0.92×100k = +92,000
  await confirmFinalScore(db, 1, 1, 2, 1, NOW);
  const [g] = await db
    .select()
    .from(schema.bets)
    .where(eq(schema.bets.id, b.id));
  expect(g.status).toBe("won");
  expect(g.netMmk).toBe(92_000);
});

it("correction re-grades while unsettled, blocked once settled, voids excluded", async () => {
  const b = await bet(1, "fav", 100_000);
  await confirmFinalScore(db, 1, 1, 2, 1, NOW);
  // Malay: BRA 3-1 → effFav=3,effDog=1 → margin=2 > N=0.75 → fav WIN.
  //        priceC=+92 → +0.92×100k = +92,000
  await correctScore(db, 1, 1, 3, 1, NOW);
  const [g] = await db
    .select()
    .from(schema.bets)
    .where(eq(schema.bets.id, b.id));
  expect(g.status).toBe("won");
  expect(g.netMmk).toBe(92_000);
  expect(
    (await db.select().from(schema.auditLog)).some(
      (a) => a.action === "score_correction",
    ),
  ).toBe(true);

  await db.update(schema.matchDays).set({ status: "settled" });
  await expect(correctScore(db, 1, 1, 1, 1, NOW)).rejects.toThrow(/settled/);
});

// ─── NEW TESTS ────────────────────────────────────────────────────────────────

it("void exclusion: voided bet stays void after grading and after correctScore", async () => {
  const b = await bet(1, "fav", 100_000);
  // void the bet before confirming
  await db
    .update(schema.bets)
    .set({ status: "void", netMmk: null })
    .where(eq(schema.bets.id, b.id));

  await confirmFinalScore(db, 1, 1, 2, 1, NOW);

  const [afterConfirm] = await db
    .select()
    .from(schema.bets)
    .where(eq(schema.bets.id, b.id));
  expect(afterConfirm.status).toBe("void");
  expect(afterConfirm.netMmk).toBeNull();

  // also after correctScore
  await correctScore(db, 1, 1, 3, 1, NOW);

  const [afterCorrect] = await db
    .select()
    .from(schema.bets)
    .where(eq(schema.bets.id, b.id));
  expect(afterCorrect.status).toBe("void");
  expect(afterCorrect.netMmk).toBeNull();
});

it("double confirm: second confirmFinalScore throws /already finished/", async () => {
  await bet(1, "fav", 100_000);
  await confirmFinalScore(db, 1, 1, 2, 1, NOW);
  await expect(confirmFinalScore(db, 1, 1, 2, 1, NOW)).rejects.toThrow(
    /already finished/,
  );
});

it("VAR clamp: live bet at 2-1, final 0-0 → graded as effective 0-0", async () => {
  // Set match live with score 2-1
  await db
    .update(schema.matches)
    .set({ status: "live", homeScore: 2, awayScore: 1 })
    .where(eq(schema.matches.id, 1));

  // Place a dog (MEX) bet at 2-1 — line is BRA home fav, ballQ=3 (0.75 balls), priceC=92
  const b = await bet(1, "dog", 100_000);

  // Final score 0-0 → VAR reversal scenario
  // effHome = 0 - 2 = -2, clamped to 0
  // effAway = 0 - 1 = -1, clamped to 0
  // dog eff score: effFav=0, effDog=0
  // Malay: margin = 0-0 = 0 < N=0.75 → dog WIN. priceC=+92 → +0.92×100k = +92,000
  await confirmFinalScore(db, 1, 1, 0, 0, NOW);

  const [g] = await db
    .select()
    .from(schema.bets)
    .where(eq(schema.bets.id, b.id));
  expect(g.status).toBe("won");
  expect(g.netMmk).toBe(92_000);
});

it("invalid scores: home 100 or fractional → /invalid score/", async () => {
  await expect(confirmFinalScore(db, 1, 1, 100, 0, NOW)).rejects.toThrow(
    /invalid score/,
  );
  await expect(confirmFinalScore(db, 1, 1, 1.5, 0, NOW)).rejects.toThrow(
    /invalid score/,
  );
});

it("correctScore on scheduled match → /not finished/", async () => {
  // match 1 is scheduled (default), not finished
  await expect(correctScore(db, 1, 1, 2, 1, NOW)).rejects.toThrow(
    /not finished/,
  );
});

it("correction on closed-not-settled day succeeds, day stays closed", async () => {
  await bet(1, "fav", 100_000);
  // Confirm both matches so day closes
  await confirmFinalScore(db, 1, 1, 2, 1, NOW);
  await confirmFinalScore(db, 1, 2, 0, 0, NOW);

  // Day should be closed
  const dayBefore = (await db.select().from(schema.matchDays))[0];
  expect(dayBefore.status).toBe("closed");

  // correctScore should succeed on a closed (non-settled) day
  await correctScore(db, 1, 1, 3, 1, NOW);

  const dayAfter = (await db.select().from(schema.matchDays))[0];
  expect(dayAfter.status).toBe("closed"); // still closed, not reverted
});

it("paid-ticket guard: correctScore throws /settled/ when ticket has settlementId", async () => {
  const b = await bet(1, "fav", 100_000);
  await confirmFinalScore(db, 1, 1, 2, 1, NOW);

  // Create a matchDays row (already exists from confirmFinalScore closing the day via bet(2) or we need both matches done)
  // Actually match 2 hasn't been confirmed, so day is still open. Let's get or create the day.
  // The matchDays row might not exist yet — let's insert or get it
  let [dayRow] = await db
    .select()
    .from(schema.matchDays)
    .where(eq(schema.matchDays.date, "2026-06-12"));
  if (!dayRow) {
    [dayRow] = await db
      .insert(schema.matchDays)
      .values({ date: "2026-06-12" })
      .returning();
  }

  // Insert a settlement row (FK requires matchDayId + playerId)
  const [settlement] = await db
    .insert(schema.settlements)
    .values({
      ref: "S-0612-01",
      matchDayId: dayRow.id,
      playerId: 2,
      netMmk: 46_000,
      markedBy: 1,
      markedAt: NOW,
    })
    .returning();

  // Stamp the ticket with the settlementId
  await db
    .update(schema.bets)
    .set({ settlementId: settlement.id })
    .where(eq(schema.bets.id, b.id));

  await expect(correctScore(db, 1, 1, 3, 1, NOW)).rejects.toThrow(/settled/);
});

it("day_closed broadcast: fires exactly once with correct date when last match graded", async () => {
  const chunks: string[] = [];
  const unsub = sseHub.subscribe((chunk) => chunks.push(chunk));

  try {
    // Only match 1 on this day — confirming it closes the day
    // First remove match 2 from the equation by keeping only match 1
    // Actually both matches share the same day. Confirm match 2 first silently,
    // then confirm match 1 and check the broadcast.
    // Better: use a fresh db with only one match on the day.
    // We can't easily re-seed here, so let's just confirm both and watch the second call.
    await confirmFinalScore(db, 1, 1, 2, 1, NOW); // day still open (match 2 pending)
    const beforeSecond = chunks.length;
    await confirmFinalScore(db, 1, 2, 0, 0, NOW); // this should close the day

    const newChunks = chunks.slice(beforeSecond);
    const dayClosedChunks = newChunks.filter((c) => c.includes("day_closed"));
    expect(dayClosedChunks).toHaveLength(1);
    expect(dayClosedChunks[0]).toContain("2026-06-12");
  } finally {
    unsub();
  }
});

// ── O2 NEW TESTS ─────────────────────────────────────────────────────────────

it("both markets graded correctly: ah fav, ou over live at 1-0, ou under", async () => {
  /*
   * Setup:
   *   Match 1 (BRA vs MEX), matchDay 2026-06-12
   *   AH line:  BRA home fav, ballQ=3 (N=0.75 handicap), priceC=+92 (p=+0.92)
   *   OU line:  ballQ=10 (N=2.5 goals × 4), priceC=+90 (p=+0.90)
   *
   * Bets:
   *   Bet A — ah fav, stake 100,000 MMK, placed pre-match (score 0-0)
   *   Bet B — ou over, stake 200,000 MMK, placed live at score 1-0
   *   Bet C — ou under, stake 150,000 MMK, placed pre-match (score 0-0)
   *
   * Final score: BRA 2 – 1 MEX
   *
   * Malay hand math:
   *
   * Bet A (AH fav, pre-match, scoreAtBet 0-0):
   *   effHome = 2−0 = 2, effAway = 1−0 = 1
   *   favSide = home → effFav=2, effDog=1
   *   margin = 2−1 = 1 > N=0.75 → fav WIN
   *   priceC>0 → +0.92×100,000 = +92,000
   *   status: won, net = +92,000
   *
   * Bet B (OU over, live at 1-0, scoreAtBet home=1 away=0):
   *   effHome = 2−1 = 1, effAway = 1−0 = 1
   *   total = 1+1 = 2 < N=2.5 → over LOSE
   *   priceC>0 → −S = −200,000
   *   status: lost, net = −200,000
   *
   * Bet C (OU under, pre-match, scoreAtBet 0-0):
   *   effHome = 2−0 = 2, effAway = 1−0 = 1
   *   total = 2+1 = 3 > N=2.5 → under LOSE
   *   priceC>0 → −S = −150,000
   *   status: lost, net = −150,000
   */

  // Post AH line pre-match
  await postLine(
    db,
    1,
    {
      matchId: 1,
      market: "ah",
      favSide: "home",
      ballQ: 3,
      priceC: 92,
    },
    NOW,
  );

  // Post OU line pre-match (ballQ=10 = 2.5 goals × 4), offering under for Bet C
  await postLine(
    db,
    1,
    {
      matchId: 1,
      market: "ou",
      favSide: "home",
      ballQ: 10,
      priceC: 90,
    },
    NOW,
  );

  // Bet A: ah fav pre-match (score 0-0) — admin record path bypasses started gate
  const betA = await recordBet(
    db,
    1,
    {
      playerId: 2,
      matchId: 1,
      market: "ah",
      side: "fav",
      stakeMmk: 100_000,
      scoreHomeAtBet: 0,
      scoreAwayAtBet: 0,
    },
    NOW,
  );
  expect(betA.scoreHomeAtBet).toBe(0);
  expect(betA.scoreAwayAtBet).toBe(0);

  // Bet C: ou under pre-match (score 0-0) — placed before going live
  const betC = await recordBet(
    db,
    1,
    {
      playerId: 2,
      matchId: 1,
      market: "ou",
      side: "under",
      stakeMmk: 150_000,
      scoreHomeAtBet: 0,
      scoreAwayAtBet: 0,
    },
    NOW,
  );
  expect(betC.scoreHomeAtBet).toBe(0);
  expect(betC.scoreAwayAtBet).toBe(0);

  // Re-post the OU line offering over for Bet B (same ballQ/priceC → same grading)
  await postLine(
    db,
    1,
    {
      matchId: 1,
      market: "ou",
      favSide: "home",
      ballQ: 10,
      priceC: 90,
    },
    NOW,
  );

  // Set match live at 1-0 before placing Bet B
  await db
    .update(schema.matches)
    .set({ status: "live", homeScore: 1, awayScore: 0 })
    .where(eq(schema.matches.id, 1));

  // Bet B: ou over placed live at 1-0 (score snapshot 1-0)
  const betB = await recordBet(
    db,
    1,
    {
      playerId: 2,
      matchId: 1,
      market: "ou",
      side: "over",
      stakeMmk: 200_000,
      scoreHomeAtBet: 1,
      scoreAwayAtBet: 0,
    },
    NOW,
  );
  expect(betB.scoreHomeAtBet).toBe(1);
  expect(betB.scoreAwayAtBet).toBe(0);

  // Confirm final: BRA 2 – 1 MEX
  await confirmFinalScore(db, 1, 1, 2, 1, NOW);

  const [gA] = await db
    .select()
    .from(schema.bets)
    .where(eq(schema.bets.id, betA.id));
  const [gB] = await db
    .select()
    .from(schema.bets)
    .where(eq(schema.bets.id, betB.id));
  const [gC] = await db
    .select()
    .from(schema.bets)
    .where(eq(schema.bets.id, betC.id));

  // Bet A: AH fav pre-match → margin 1>0.75 → WIN, +0.92×100k = +92,000
  expect(gA.status).toBe("won");
  expect(gA.netMmk).toBe(92_000);

  // Bet B: OU over live at 1-0 → total 2<2.5 → LOSE, priceC>0 → −S = −200,000
  expect(gB.status).toBe("lost");
  expect(gB.netMmk).toBe(-200_000);

  // Bet C: OU under pre-match → total 3>2.5 → LOSE, priceC>0 → −S = −150,000
  expect(gC.status).toBe("lost");
  expect(gC.netMmk).toBe(-150_000);
});

it("two-sided line: fav and dog grade from their own snapshot prices", async () => {
  // One line, two prices: fav +0.92, dog −0.98. Both sides bet on v1.
  await postLine(
    db,
    1,
    {
      matchId: 1,
      market: "ah",
      favSide: "home",
      ballQ: 2, // N = 0.5
      priceC: 92,
      priceOppC: -98,
    },
    NOW,
  );
  const favBet = await recordBet(
    db,
    1,
    {
      playerId: 2,
      matchId: 1,
      market: "ah",
      side: "fav",
      stakeMmk: 100_000,
      scoreHomeAtBet: 0,
      scoreAwayAtBet: 0,
    },
    NOW,
  );
  const dogBet = await recordBet(
    db,
    1,
    {
      playerId: 2,
      matchId: 1,
      market: "ah",
      side: "dog",
      stakeMmk: 100_000,
      scoreHomeAtBet: 0,
      scoreAwayAtBet: 0,
    },
    NOW,
  );
  // Snapshot prices differ per side.
  expect(favBet.priceC).toBe(92);
  expect(dogBet.priceC).toBe(-98);

  // BRA 1-0 → margin 1 > N=0.5 → fav WIN, dog LOSE.
  await confirmFinalScore(db, 1, 1, 1, 0, NOW);
  const [gFav] = await db
    .select()
    .from(schema.bets)
    .where(eq(schema.bets.id, favBet.id));
  const [gDog] = await db
    .select()
    .from(schema.bets)
    .where(eq(schema.bets.id, dogBet.id));
  // fav: priceC=+92 → +0.92×100k = +92,000
  expect(gFav.status).toBe("won");
  expect(gFav.netMmk).toBe(92_000);
  // dog: priceOppC=−98 → lose, p<0 → −0.98×100k = −98,000
  expect(gDog.status).toBe("lost");
  expect(gDog.netMmk).toBe(-98_000);
});
