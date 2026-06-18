import { getDb } from "../src/lib/db/index";
import { confirmFinalScore } from "../src/lib/bets/settleMatch";
import { nowIso } from "../src/lib/time";

// [matchId, homeScore, awayScore] — confirmed WC2026 round-1 results.
const SCORES: Array<[number, number, number]> = [
  [13, 0, 0], [14, 1, 1], [15, 1, 1], [16, 2, 2], [17, 3, 1], [18, 1, 4],
  [19, 3, 0], [20, 3, 1], [21, 1, 1], [22, 4, 2], [23, 1, 0], [24, 1, 3],
];
const ADMIN = 2;

async function main() {
  const db = getDb();
  for (const [id, h, a] of SCORES) {
    try {
      await confirmFinalScore(db, ADMIN, id, h, a, nowIso());
      console.log(`match ${id}: ${h}-${a} confirmed & graded`);
    } catch (e) {
      console.error(`match ${id} FAILED: ${e instanceof Error ? e.message : e}`);
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
