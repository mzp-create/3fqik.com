// Populate/refresh the team_wiki cache from Wikipedia for all 48 finalists.
// Idempotent (upsert on code). Reports failures so bad titles can be fixed.
//   DATABASE_URL=… npm run db:fetch-teams
import { getDb, schema } from "../src/lib/db/index";
import { buildTeamWiki } from "../src/lib/wiki/teams";
import { nowIso } from "../src/lib/time";

// The 48 WC2026 finalist FIFA codes (mirrors FIFA_NAME in src/lib/client/flags.ts).
const CODES = [
  "MEX",
  "RSA",
  "KOR",
  "CZE",
  "CAN",
  "BIH",
  "QAT",
  "SUI",
  "BRA",
  "MAR",
  "HAI",
  "USA",
  "PAR",
  "AUS",
  "TUR",
  "GER",
  "CUW",
  "CIV",
  "ECU",
  "NED",
  "JPN",
  "SWE",
  "TUN",
  "BEL",
  "EGY",
  "IRN",
  "NZL",
  "ESP",
  "CPV",
  "KSA",
  "URU",
  "FRA",
  "SEN",
  "IRQ",
  "NOR",
  "ARG",
  "ALG",
  "AUT",
  "JOR",
  "POR",
  "COD",
  "UZB",
  "COL",
  "CRO",
  "GHA",
  "PAN",
  "ENG",
  "SCO",
];

async function main() {
  const db = getDb();
  let ok = 0;
  const noExtract: string[] = [];
  const failed: string[] = [];
  for (const code of CODES) {
    try {
      const row = await buildTeamWiki(code, nowIso());
      if (!row) {
        failed.push(`${code} (no title)`);
        continue;
      }
      await db
        .insert(schema.teamWiki)
        .values(row)
        .onConflictDoUpdate({ target: schema.teamWiki.code, set: row });
      ok++;
      if (!row.extract) noExtract.push(code);
    } catch (e) {
      failed.push(`${code}: ${e instanceof Error ? e.message : e}`);
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  console.log(`team_wiki: upserted ${ok}/${CODES.length}`);
  if (noExtract.length) console.log(`  no extract: ${noExtract.join(", ")}`);
  if (failed.length) console.log(`  FAILED: ${failed.join(" | ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
