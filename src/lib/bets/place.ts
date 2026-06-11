import { and, eq, inArray, ne, sql } from 'drizzle-orm'
import { schema, type Db } from '@/lib/db'
import { latestLine } from '@/lib/lines/manage'
import { newTicketNo } from '@/lib/ticket/ticketNo'

export const MIN_STAKE = 10_000

// ATOMICITY WARNING: better-sqlite3 transactions are synchronous — never introduce
// async operations (await, Promise, setTimeout) inside db.transaction(). Doing so
// silently breaks the atomicity guarantee. Same discipline as flows.ts.

function err(message: string, httpStatus = 400, code = 'error', extra?: Record<string, unknown>) {
  return Object.assign(new Error(message), { httpStatus, code, ...extra })
}

const fmt = (n: number) => n.toLocaleString('en-US')

export function placeBet(
  db: Db, playerId: number,
  input: { matchId: number; lineVersion: number; side: 'fav' | 'dog'; stakeMmk: number },
  at: string,
) {
  if (!Number.isInteger(input.stakeMmk) || input.stakeMmk < MIN_STAKE)
    throw err(`minimum stake is ${fmt(MIN_STAKE)} MMK`, 400, 'bad_stake')

  // better-sqlite3 transactions are synchronous — drizzle exposes db.transaction
  return db.transaction(tx => {
    const match = tx.select().from(schema.matches).where(eq(schema.matches.id, input.matchId)).get()
    if (!match) throw err('match not found', 404, 'not_found')
    if (match.status === 'finished') throw err('match finished', 400, 'match_finished')

    const line = latestLine(tx as unknown as Db, input.matchId)
    if (!line || line.status === 'closed') throw err('betting closed for this match', 400, 'betting_closed')
    if (line.status === 'suspended') throw err('line suspended — updating', 400, 'line_suspended')
    if (line.version !== input.lineVersion)
      throw Object.assign(new Error('line moved — confirm the new price'), {
        httpStatus: 409,
        code: 'line_moved',
        extra: { currentLine: line },
      })

    // limits: carve-out vs daily pool (spec §8)
    // ATOMICITY WARNING: stakeOn uses synchronous SQLite aggregates — no await
    const stakeOn = (matchIds: number[]) =>
      matchIds.length === 0 ? 0 :
      tx.select({ s: sql<number>`coalesce(sum(${schema.bets.stakeMmk}), 0)` })
        .from(schema.bets)
        .where(and(inArray(schema.bets.matchId, matchIds), ne(schema.bets.status, 'void')))
        .get()!.s

    if (match.betLimitMmk != null) {
      // carve-out match: uses its own cap, completely independent of the daily pool
      const head = match.betLimitMmk - stakeOn([match.id])
      if (input.stakeMmk > head)
        throw err(
          `house can accept only ${fmt(Math.max(head, 0))} MMK more on this match`,
          409,
          'limit_reached',
        )
    } else {
      // non-carve-out match: counts against the daily pool
      const cfg = tx.select().from(schema.settings).get()
      const daily = cfg?.dailyTotalLimitMmk ?? 0
      if (daily > 0) {
        // only non-carve-out matches on the same matchDay count toward the pool
        const poolMatches = tx.select({ id: schema.matches.id }).from(schema.matches)
          .where(and(eq(schema.matches.matchDay, match.matchDay), sql`${schema.matches.betLimitMmk} is null`))
          .all().map(r => r.id)
        const head = daily - stakeOn(poolMatches)
        if (input.stakeMmk > head)
          throw err(
            `house can accept only ${fmt(Math.max(head, 0))} MMK more on this match day`,
            409,
            'limit_reached',
          )
      }
    }

    // ensure match_day row exists and is open
    let day = tx.select().from(schema.matchDays).where(eq(schema.matchDays.date, match.matchDay)).get()
    if (!day) day = tx.insert(schema.matchDays).values({ date: match.matchDay }).returning().get()
    if (day.status !== 'open') throw err('match day is closed for betting', 400, 'betting_closed')

    return tx.insert(schema.bets).values({
      ticketNo: newTicketNo(), playerId, matchId: match.id, lineId: line.id,
      side: input.side, stakeMmk: input.stakeMmk,
      scoreHomeAtBet: match.homeScore ?? 0, scoreAwayAtBet: match.awayScore ?? 0,
      placedAt: at,
    }).returning().get()
  })
}
