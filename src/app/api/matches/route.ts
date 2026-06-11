import { getDb, schema } from '@/lib/db'
import { requirePlayer } from '@/lib/auth/session'
import { latestLine } from '@/lib/lines/manage'
import { ok, handle } from '@/lib/api'

export async function GET() {
  return handle(async () => {
    await requirePlayer()
    const db = getDb()
    const all = db.select().from(schema.matches).all()
    return ok(all.map(m => ({ ...m, line: latestLine(db, m.id) })))
  })
}
