/**
 * Option-C wipe + re-grade. Destructive on settlement state:
 *   1. delete all settlements; null bets.settlement_id
 *   2. demote settled match_days → closed
 *   3. re-grade every non-void bet on a finished match under the canonical Malay
 *      engine, FROM THE BET'S SNAPSHOT PRICE (bets.price_c), not the line
 *   4. write scripts/out/regrade-bets.json (per-bet detail for the Excel export)
 *   5. print a per-player old-vs-new summary
 *
 * Guards: DRY_RUN=1 computes + dumps JSON but writes nothing to the DB.
 *         CONFIRM=1 is required to actually mutate (safety).
 * Usage: DRY_RUN=1 npm run db:regrade   |   CONFIRM=1 npm run db:regrade
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { and, eq, ne, isNotNull } from "drizzle-orm";
import { getDb, schema } from "../src/lib/db/index";
import { gradeDetail, type GradeInput } from "../src/lib/engine/grade";
import { computeFee } from "../src/lib/fees";

type Acc = { old: number; neu: number; n: number };

async function main() {
  const db = getDb();
  const dryRun = process.env.DRY_RUN === "1";
  const confirmed = process.env.CONFIRM === "1";
  if (!dryRun && !confirmed) {
    console.error("Refusing to mutate without CONFIRM=1 (or use DRY_RUN=1).");
    process.exit(1);
  }

  const [settingsRow] = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.id, 1));
  const commissionPct = settingsRow?.commissionPct ?? 3;
  const discountPct = settingsRow?.discountPct ?? 2;

  // ── 1+2: wipe settlement effects ──
  if (!dryRun) {
    await db
      .update(schema.bets)
      .set({ settlementId: null })
      .where(isNotNull(schema.bets.settlementId));
    await db.delete(schema.settlements);
    await db
      .update(schema.matchDays)
      .set({ status: "closed" })
      .where(eq(schema.matchDays.status, "settled"));
  }

  const finished = await db
    .select()
    .from(schema.matches)
    .where(eq(schema.matches.status, "finished"));
  const players = await db
    .select({ id: schema.players.id, name: schema.players.displayName })
    .from(schema.players);
  const nameOf = new Map(players.map((p) => [p.id, p.name]));

  const byPlayer = new Map<number, Acc>();
  const dump: Record<string, unknown>[] = [];
  let regraded = 0;

  for (const match of finished) {
    const finalHome = match.homeScore!;
    const finalAway = match.awayScore!;
    const linesRows = await db
      .select()
      .from(schema.lines)
      .where(eq(schema.lines.matchId, match.id));
    const lines = new Map(linesRows.map((l) => [l.id, l]));
    const bets = await db
      .select()
      .from(schema.bets)
      .where(
        and(eq(schema.bets.matchId, match.id), ne(schema.bets.status, "void")),
      );

    for (const bet of bets) {
      const line = lines.get(bet.lineId);
      if (!line) {
        console.warn(`SKIP ${bet.ticketNo}: line ${bet.lineId} missing`);
        continue;
      }
      const effHome = Math.max(finalHome - bet.scoreHomeAtBet, 0);
      const effAway = Math.max(finalAway - bet.scoreAwayAtBet, 0);
      const effFav = line.favSide === "home" ? effHome : effAway;
      const effDog = line.favSide === "home" ? effAway : effHome;

      const d = gradeDetail({
        market: line.market,
        side: bet.side,
        ballQ: line.ballQ,
        priceC: bet.priceC ?? line.priceC, // snapshot price; fall back for legacy rows
        stake: bet.stakeMmk,
        effFav,
        effDog,
      } as GradeInput);
      const newFee = computeFee(d.netMmk, commissionPct, discountPct);

      const oldEff = (bet.netMmk ?? 0) + (bet.feeMmk ?? 0);
      const newEff = d.netMmk + newFee;
      const cur = byPlayer.get(bet.playerId) ?? { old: 0, neu: 0, n: 0 };
      cur.old += oldEff;
      cur.neu += newEff;
      cur.n += 1;
      byPlayer.set(bet.playerId, cur);

      dump.push({
        ticketNo: bet.ticketNo,
        player: nameOf.get(bet.playerId) ?? bet.playerId,
        match: `${match.homeTeam} v ${match.awayTeam}`,
        finalScore: `${finalHome}-${finalAway}`,
        market: line.market,
        side: bet.side,
        ballQ: line.ballQ,
        lineGoals: d.lineGoals,
        priceC: bet.priceC ?? line.priceC,
        stakeMmk: bet.stakeMmk,
        legs: d.legs,
        result: d.result,
        status: d.status,
        oldNet: bet.netMmk ?? 0,
        newNet: d.netMmk,
        newFee,
        deltaEff: newEff - oldEff,
      });

      if (!dryRun)
        await db
          .update(schema.bets)
          .set({
            status: d.status,
            netMmk: d.netMmk,
            feeMmk: newFee,
            settledAt: null,
          })
          .where(eq(schema.bets.id, bet.id));
      regraded++;
    }
  }

  mkdirSync("scripts/out", { recursive: true });
  writeFileSync("scripts/out/regrade-bets.json", JSON.stringify(dump, null, 2));

  const fmt = (n: number) => (n >= 0 ? "+" : "") + n.toLocaleString("en-US");
  console.log(
    `\n${dryRun ? "[DRY RUN — DB untouched] " : ""}Re-graded ${regraded} bet(s). Dump → scripts/out/regrade-bets.json\n`,
  );
  console.log("=== per-player old → new (effective net incl. fee) ===");
  for (const [pid, d] of [...byPlayer.entries()].sort(
    (a, b) => a[1].neu - a[1].old - (b[1].neu - b[1].old),
  )) {
    console.log(
      `  ${nameOf.get(pid) ?? pid}: old ${fmt(d.old)} → new ${fmt(d.neu)}  (Δ ${fmt(d.neu - d.old)})  [${d.n}]`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
