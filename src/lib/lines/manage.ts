import { eq, desc } from 'drizzle-orm'
import { schema, type Db } from '@/lib/db'
import { sseHub } from '@/lib/sse'

function err(message: string, httpStatus = 400, code = 'error') {
  return Object.assign(new Error(message), { httpStatus, code })
}

/** Returns the latest active line for a match, or null if none. */
export function activeLine(db: Db, matchId: number) {
  const latest = db.select().from(schema.lines)
    .where(eq(schema.lines.matchId, matchId))
    .orderBy(desc(schema.lines.version)).limit(1).get()
  return latest && latest.status === 'active' ? latest : null
}

/** Returns the latest line for a match (any status), or null if none. */
export function latestLine(db: Db, matchId: number) {
  return db.select().from(schema.lines)
    .where(eq(schema.lines.matchId, matchId))
    .orderBy(desc(schema.lines.version)).limit(1).get() ?? null
}

export function postLine(
  db: Db, adminId: number,
  input: { matchId: number; favSide: 'home' | 'away'; ballQ: number; priceC: number },
  at: string,
) {
  // Validate inputs first (before entering the transaction)
  if (!Number.isInteger(input.ballQ) || input.ballQ < 0 || input.ballQ > 40)
    throw err('invalid ball: must be integer 0–40', 400, 'bad_line')
  if (!Number.isInteger(input.priceC) || input.priceC === 0 || Math.abs(input.priceC) > 100)
    throw err('invalid price: must be non-zero integer in [-100, 100]', 400, 'bad_line')

  // Wrap close-prev + insert in a transaction to protect the read-modify-write
  // against the UNIQUE(matchId, version) constraint race. Intentional deviation:
  // the plan shows unprotected read-modify-write; we use db.transaction for atomicity.
  const line = db.transaction(tx => {
    const match = tx.select().from(schema.matches).where(eq(schema.matches.id, input.matchId)).get()
    if (!match) throw err('match not found', 404, 'not_found')
    if (match.status === 'finished') throw err('match is finished', 400, 'match_finished')

    const prev = tx.select().from(schema.lines)
      .where(eq(schema.lines.matchId, input.matchId))
      .orderBy(desc(schema.lines.version)).limit(1).get() ?? null

    if (prev && prev.status !== 'closed')
      tx.update(schema.lines).set({ status: 'closed' }).where(eq(schema.lines.id, prev.id)).run()

    return tx.insert(schema.lines).values({
      matchId: input.matchId,
      version: (prev?.version ?? 0) + 1,
      favSide: input.favSide,
      ballQ: input.ballQ,
      priceC: input.priceC,
      status: 'active',
      postedBy: adminId,
      postedAt: at,
    }).returning().get()
  })

  sseHub.broadcast('line_update', { matchId: input.matchId, line })
  return line
}

export function setLineStatus(db: Db, matchId: number, status: 'active' | 'suspended' | 'closed') {
  // single-process assumption: synchronous better-sqlite3 means no interleaving between read and update; revisit if ever multi-process
  const latest = latestLine(db, matchId)
  if (!latest) throw err('no line for this match', 404, 'no_line')
  if (latest.status === 'closed' && status !== 'closed')
    throw err('line is closed and cannot be reopened', 400, 'line_closed')
  db.update(schema.lines).set({ status }).where(eq(schema.lines.id, latest.id)).run()
  const updated = { ...latest, status }
  sseHub.broadcast('line_update', { matchId, line: updated })
  return updated
}
