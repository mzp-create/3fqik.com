import { getDb, schema } from '../src/lib/db/index'
import { matchDayOf } from '../src/lib/time'
import fixtures from '../data/fixtures.json'

const db = getDb()
const existing = db.select().from(schema.matches).all()
if (existing.length > 0) {
  console.log(`matches already seeded (${existing.length}), skipping`)
} else {
  for (const f of fixtures as Array<{ stage: string; home: string; away: string; kickoffUtc: string; venue: string }>) {
    db.insert(schema.matches).values({
      stage: f.stage, homeTeam: f.home, awayTeam: f.away,
      kickoffUtc: f.kickoffUtc, venue: f.venue, matchDay: matchDayOf(f.kickoffUtc),
    }).run()
  }
  console.log(`seeded ${fixtures.length} matches`)
}
db.insert(schema.settings).values({ id: 1, dailyTotalLimitMmk: 0 }).onConflictDoNothing().run()
console.log('settings ensured')
