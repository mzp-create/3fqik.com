/**
 * Re-grade ALL non-void bets on finished matches under the Malay signed-price
 * model, and report a per-player old-vs-new delta for already-settled bets so
 * the banker can reconcile cash. settlements.net_mmk (what was actually paid)
 * is NOT changed — only each bet's status/net/fee.
 *
 * Usage: npm run db:regrade
 */

import { and, eq, ne } from "drizzle-orm";
import { getDb, schema } from "../src/lib/db/index";
import { gradeBet, type GradeInput } from "../src/lib/engine/grade";
import { computeFee } from "../src/lib/fees";

type Acc = { old: number; neu: number; n: number };

async function main() {
  const db = getDb();
  const dryRun = process.env.DRY_RUN === "1";

  const [settingsRow] = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.id, 1));
  const commissionPct = settingsRow?.commissionPct ?? 3;
  const discountPct = settingsRow?.discountPct ?? 2;

  const finished = await db
    .select()
    .from(schema.matches)
    .where(eq(schema.matches.status, "finished"));
  const players = await db
    .select({ id: schema.players.id, name: schema.players.displayName })
    .from(schema.players);
  const nameOf = new Map(players.map((p) => [p.id, p.name]));

  const settled = new Map<number, Acc>(); // already-paid bets
  const unsettled = new Map<number, Acc>();
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

      const r = gradeBet({
        market: line.market,
        side: bet.side,
        ballQ: line.ballQ,
        priceC: line.priceC,
        stake: bet.stakeMmk,
        effFav,
        effDog,
      } as GradeInput);
      const newFee = computeFee(r.netMmk, commissionPct, discountPct);

      const oldEff = (bet.netMmk ?? 0) + (bet.feeMmk ?? 0);
      const newEff = r.netMmk + newFee;
      const bucket = bet.settlementId != null ? settled : unsettled;
      const cur = bucket.get(bet.playerId) ?? { old: 0, neu: 0, n: 0 };
      cur.old += oldEff;
      cur.neu += newEff;
      cur.n += 1;
      bucket.set(bet.playerId, cur);

      if (!dryRun)
        await db
          .update(schema.bets)
          .set({ status: r.status, netMmk: r.netMmk, feeMmk: newFee })
          .where(eq(schema.bets.id, bet.id));
      regraded++;
    }
  }

  const fmt = (n: number) => (n >= 0 ? "+" : "") + n.toLocaleString("en-US");
  console.log(
    `\n${dryRun ? "[DRY RUN — no changes written] " : ""}Re-graded ${regraded} bet(s) under the Malay model.\n`,
  );

  console.log(
    "=== SETTLED bets — already paid; reconcile the delta in cash ===",
  );
  if (settled.size === 0) console.log("  (none)");
  for (const [pid, d] of [...settled.entries()].sort(
    (a, b) => a[1].neu - a[1].old - (b[1].neu - b[1].old),
  )) {
    const delta = d.neu - d.old;
    console.log(
      `  ${nameOf.get(pid) ?? pid}: old ${fmt(d.old)} → new ${fmt(d.neu)}  (Δ ${fmt(delta)})  [${d.n} bet(s)]`,
    );
  }

  console.log("\n=== UNSETTLED bets — re-graded, settle normally ===");
  if (unsettled.size === 0) console.log("  (none)");
  for (const [pid, d] of unsettled.entries())
    console.log(
      `  ${nameOf.get(pid) ?? pid}: new total ${fmt(d.neu)}  [${d.n} bet(s)]`,
    );

  console.log(
    "\nNote: settlements.net_mmk (already-paid amounts) were NOT changed; the Δ above is the cash to square up.",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
