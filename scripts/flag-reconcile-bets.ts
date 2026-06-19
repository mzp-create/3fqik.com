/**
 * Flag the bets whose grading is in question against the master ledger
 * (worldcup2026.xlsx). These sit on matches where our per-match P/L (Si Thu's
 * side) differs materially from the sheet — round-1 sign, wrong favourite,
 * quarter goal-lines, or differing bet sets. Sets bets.reconcile_note so the
 * issue is visible per bet; the sheet remains the source of truth.
 *
 *   DRY_RUN=1 npx tsx scripts/flag-reconcile-bets.ts   # preview
 *   npx tsx scripts/flag-reconcile-bets.ts             # apply
 */
import { and, eq, ne } from "drizzle-orm";
import { getDb, schema } from "../src/lib/db/index";

const dry = process.env.DRY_RUN === "1";

// Si Thu-perspective gap (ours − sheet) per match, from the per-match diff.
// Keyed by sorted FIFA code pair. Reason categorizes the discrepancy.
const FLAGS: { pair: string; gap: number; reason: string }[] = [
  {
    pair: "COL|UZB",
    gap: 5_850_000,
    reason: "grade flipped (wrong favourite)",
  },
  { pair: "AUS|TUR", gap: -5_390_000, reason: "grade flip + bet set differs" },
  { pair: "BIH|CAN", gap: -3_338_000, reason: "grade flipped" },
  {
    pair: "MEX|RSA",
    gap: -1_670_000,
    reason: "O/U settled as loss not push (quarter line?)",
  },
  { pair: "CAN|QAT", gap: 1_176_000, reason: "partial mismatch" },
  { pair: "CZE|RSA", gap: -1_164_000, reason: "partial mismatch" },
  { pair: "KOR|MEX", gap: -1_164_000, reason: "partial mismatch" },
  { pair: "IRQ|NOR", gap: 1_087_000, reason: "partial mismatch" },
  { pair: "FRA|SEN", gap: -727_500, reason: "partial mismatch" },
  { pair: "GHA|PAN", gap: -679_000, reason: "partial mismatch" },
  {
    pair: "CIV|ECU",
    gap: -627_500,
    reason: "partial mismatch (quarter line?)",
  },
  { pair: "HAI|SCO", gap: -510_000, reason: "partial mismatch" },
  { pair: "CRO|ENG", gap: 490_000, reason: "partial mismatch" },
  { pair: "IRN|NZL", gap: -392_000, reason: "partial mismatch" },
  { pair: "JPN|NED", gap: 363_750, reason: "partial mismatch" },
  { pair: "CZE|KOR", gap: 152_000, reason: "partial mismatch" },
  { pair: "CUW|GER", gap: -85_000, reason: "partial mismatch (quarter line?)" },
];

async function main() {
  const db = getDb();
  const matches = await db.select().from(schema.matches);
  const pk = (a: string, b: string) => [a, b].sort().join("|");
  const byPair = new Map(matches.map((m) => [pk(m.homeTeam, m.awayTeam), m]));

  let flagged = 0;
  for (const f of FLAGS) {
    const m = byPair.get(f.pair);
    if (!m) {
      console.log(`! no match for ${f.pair}`);
      continue;
    }
    const note = `Ledger mismatch (Si Thu): ours − sheet = ${f.gap >= 0 ? "+" : ""}${f.gap.toLocaleString()} MMK — ${f.reason}. Sheet is source of truth.`;
    const bets = await db
      .select()
      .from(schema.bets)
      .where(
        and(eq(schema.bets.matchId, m.id), ne(schema.bets.status, "void")),
      );
    console.log(
      `${dry ? "[dry] " : ""}#${m.id} ${m.homeTeam} v ${m.awayTeam}: flag ${bets.length} bet(s) — ${f.reason}`,
    );
    flagged += bets.length;
    if (!dry)
      await db
        .update(schema.bets)
        .set({ reconcileNote: note })
        .where(
          and(eq(schema.bets.matchId, m.id), ne(schema.bets.status, "void")),
        );
  }
  console.log(
    `\n${dry ? "[DRY RUN] " : ""}Flagged ${flagged} bets across ${FLAGS.length} matches.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
