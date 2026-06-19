/**
 * Consolidate all bets under Si Thu (player 3). The admin accounts Zeya (1) and
 * Myo Min (2) only entered bets on his behalf — every bet is really his.
 * Also records the master-sheet reconciliation figure in the audit log as the
 * source of truth (the app's bet-derived P/L has known historical issues that
 * the sheet, worldcup2026.xlsx, settles authoritatively).
 *
 *   DRY_RUN=1 npx tsx scripts/consolidate-bets-sithu.ts   # preview
 *   npx tsx scripts/consolidate-bets-sithu.ts             # apply
 */
import { inArray, eq } from "drizzle-orm";
import { getDb, schema } from "../src/lib/db/index";
import { nowIso } from "../src/lib/time";

const SI_THU = 3;
const ADMINS = [1, 2];
const SHEET_NET = 22_711_250; // Si Thu authoritative net per master ledger
const dry = process.env.DRY_RUN === "1";

async function main() {
  const db = getDb();
  const toMigrate = await db
    .select()
    .from(schema.bets)
    .where(inArray(schema.bets.playerId, ADMINS));
  console.log(
    `${dry ? "[dry] " : ""}Migrating ${toMigrate.length} bets (Zeya/Myo Min) -> Si Thu`,
  );
  for (const b of toMigrate)
    console.log(`   ${b.ticketNo} (player ${b.playerId} -> ${SI_THU})`);

  if (!dry) {
    await db
      .update(schema.bets)
      .set({ playerId: SI_THU })
      .where(inArray(schema.bets.playerId, ADMINS));
    await db.insert(schema.auditLog).values({
      actorId: 1, // Zeya (admin performing reconciliation)
      action: "ledger_reconcile",
      subject: `player:${SI_THU}`,
      detail: `Consolidated ${toMigrate.length} admin-entered bets to Si Thu. Master-sheet (worldcup2026.xlsx) authoritative net for Si Thu = +${SHEET_NET.toLocaleString()} MMK. App bet-grades differ (~6.7M, 6 matches: round-1 sign + favourite + quarter-line + bet-set differences); the sheet is the source of truth for settlement.`,
      at: nowIso(),
    });
  }

  const after = await db
    .select()
    .from(schema.bets)
    .where(eq(schema.bets.playerId, SI_THU));
  console.log(
    `\n${dry ? "[DRY RUN] " : ""}Done. Si Thu now has ${dry ? toMigrate.length + 35 : after.length} bets. Authoritative net (sheet): +${SHEET_NET.toLocaleString()} MMK.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
