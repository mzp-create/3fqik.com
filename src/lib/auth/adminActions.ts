import { eq } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import { schema, type Db } from '@/lib/db'
import { hashPin } from './pin'

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ' // no 0/O/1/I

export function randomCode(len: number): string {
  const bytes = randomBytes(len)
  let out = ''
  for (let k = 0; k < len; k++) out += ALPHABET[bytes[k] % ALPHABET.length]
  return out
}

type DbLike = Pick<Db, 'insert'>

function audit(db: DbLike, actorId: number, action: string, subject: string, at: string, detail?: string) {
  db.insert(schema.auditLog).values({ actorId, action, subject, detail, at }).run()
}

export function createInvite(db: Db, adminId: number, opts: { maxUses: number; expiresAt: string }) {
  return db.insert(schema.inviteCodes).values({
    code: randomCode(6), maxUses: opts.maxUses, expiresAt: opts.expiresAt, createdBy: adminId,
  }).returning().get()
}

function notFound(): never {
  throw Object.assign(new Error('player not found'), { httpStatus: 404, code: 'not_found' })
}

export function resetPin(db: Db, adminId: number, playerId: number, tempPin: string, at: string) {
  db.transaction(tx => {
    const p = tx.select().from(schema.players).where(eq(schema.players.id, playerId)).get()
    if (!p) notFound()
    tx.update(schema.players).set({
      pinHash: hashPin(tempPin), mustChangePin: true, sessionEpoch: p.sessionEpoch + 1,
      failedPinAttempts: 0, lockedUntil: null,
    }).where(eq(schema.players.id, playerId)).run()
    audit(tx, adminId, 'pin_reset', `player:${playerId}`, at)
  })
}

export function unlockPlayer(db: Db, adminId: number, playerId: number, at: string) {
  db.transaction(tx => {
    const p = tx.select().from(schema.players).where(eq(schema.players.id, playerId)).get()
    if (!p) notFound()
    tx.update(schema.players).set({ failedPinAttempts: 0, lockedUntil: null })
      .where(eq(schema.players.id, playerId)).run()
    audit(tx, adminId, 'unlock', `player:${playerId}`, at)
  })
}

export function grantAdmin(db: Db, adminId: number, playerId: number, at: string) {
  db.transaction(tx => {
    const p = tx.select().from(schema.players).where(eq(schema.players.id, playerId)).get()
    if (!p) notFound()
    tx.update(schema.players).set({ role: 'admin' }).where(eq(schema.players.id, playerId)).run()
    audit(tx, adminId, 'grant_admin', `player:${playerId}`, at)
  })
}
