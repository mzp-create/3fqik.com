// IMPORTANT: keep these flows synchronous (no await). Single-threaded better-sqlite3 + no suspension points = atomic check-then-write. Adding an await reintroduces races.
import { eq, sql } from 'drizzle-orm'
import { schema, type Db } from '@/lib/db'
import { normalizePhone } from './phone'
import { hashPin, verifyPin, registerFailure, registerSuccess, lockState } from './pin'

function err(message: string, httpStatus: number, code = 'error') {
  return Object.assign(new Error(message), { httpStatus, code })
}

export function registerPlayer(
  db: Db,
  input: { code: string; phone: string; name: string; pin: string },
  nowIso: string,
) {
  if (typeof input.code !== 'string' || typeof input.phone !== 'string' || typeof input.name !== 'string' || typeof input.pin !== 'string')
    throw err('invalid input', 400, 'bad_input')

  const phone = normalizePhone(input.phone)

  return db.transaction(tx => {
    const code = tx.select().from(schema.inviteCodes)
      .where(eq(schema.inviteCodes.code, input.code)).get()
    if (!code || code.usedCount >= code.maxUses || Date.parse(code.expiresAt) < Date.parse(nowIso))
      throw err('invalid or expired invite code', 400, 'invite_invalid')
    if (tx.select().from(schema.players).where(eq(schema.players.phone, phone)).get())
      throw err('phone already registered', 409, 'phone_taken')
    if (!input.name.trim()) throw err('name required', 400, 'name_required')

    const pinHash = hashPin(input.pin) // throws "PIN must be exactly 6 digits"
    const player = tx.insert(schema.players).values({
      phone, pinHash, displayName: input.name.trim(), createdAt: nowIso,
    }).returning().get()
    tx.update(schema.inviteCodes).set({ usedCount: sql`${schema.inviteCodes.usedCount} + 1` })
      .where(eq(schema.inviteCodes.id, code.id)).run()
    return player
  })
}

export function loginPlayer(db: Db, rawPhone: string, pin: string, nowIso: string) {
  if (typeof rawPhone !== 'string' || typeof pin !== 'string')
    throw err('invalid input', 400, 'bad_input')

  const phone = normalizePhone(rawPhone)
  const p = db.select().from(schema.players).where(eq(schema.players.phone, phone)).get()
  if (!p) throw err('wrong phone or PIN', 401, 'wrong_credentials')
  // Caller contract: check lockState BEFORE verifyPin; never call registerFailure while locked
  if (lockState(p, nowIso).locked) throw err('account locked — try later or ask admin', 423, 'locked')

  if (!verifyPin(pin, p.pinHash)) {
    const next = registerFailure(p, nowIso)
    db.update(schema.players).set(next).where(eq(schema.players.id, p.id)).run()
    throw err('wrong phone or PIN', 401, 'wrong_credentials')
  }
  // Use registerSuccess() per deviation #1 (intentional)
  db.update(schema.players).set(registerSuccess())
    .where(eq(schema.players.id, p.id)).run()
  return { player: { ...p, ...registerSuccess() } }
}

export function changePin(db: Db, playerId: number, currentPin: string, newPin: string) {
  if (typeof currentPin !== 'string' || typeof newPin !== 'string')
    throw err('invalid input', 400, 'bad_input')

  const p = db.select().from(schema.players).where(eq(schema.players.id, playerId)).get()
  if (!p) throw err('not found', 404)
  if (lockState(p, new Date().toISOString()).locked) throw err('account locked — try later or ask admin', 423, 'locked')
  if (!verifyPin(currentPin, p.pinHash)) {
    const next = registerFailure(p, new Date().toISOString())
    db.update(schema.players).set(next).where(eq(schema.players.id, playerId)).run()
    throw err('current PIN incorrect', 401, 'wrong_credentials')
  }
  const updated = db.update(schema.players).set({
    pinHash: hashPin(newPin), mustChangePin: false, sessionEpoch: p.sessionEpoch + 1,
    ...registerSuccess(),
  }).where(eq(schema.players.id, playerId)).returning().get()
  return updated
}
