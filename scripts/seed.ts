import { getDb, applyMigrations, schema } from "../src/lib/db/index";
import { matchDayOf } from "../src/lib/time";
import fixtures from "../data/fixtures.json";

async function main() {
  const db = getDb();
  await applyMigrations(db);

  const existing = await db.select().from(schema.matches);
  if (existing.length > 0) {
    console.log(`matches already seeded (${existing.length}), skipping`);
  } else {
    await db.transaction(async (tx) => {
      for (const f of fixtures as Array<{
        stage: string;
        home: string;
        away: string;
        kickoffUtc: string;
        venue: string;
      }>) {
        await tx.insert(schema.matches).values({
          stage: f.stage,
          homeTeam: f.home,
          awayTeam: f.away,
          kickoffUtc: f.kickoffUtc,
          venue: f.venue,
          matchDay: matchDayOf(f.kickoffUtc),
        });
      }
    });
    console.log(`seeded ${fixtures.length} matches`);
  }

  await db
    .insert(schema.settings)
    .values({ id: 1, dailyTotalLimitMmk: 0 })
    .onConflictDoNothing();
  console.log("settings ensured");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
