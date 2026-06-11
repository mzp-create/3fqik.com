import { eq } from 'drizzle-orm'
import { schema, type Db } from '@/lib/db'
import { normalizePhone } from './phone'
import { hashPin, verifyPin, registerFailure, registerSuccess, lockState } from './pin'

function err(message: string, httpStatus: number) {
  return Object.assign(new Error(message), { httpStatus })
}

export function registerPlayer(
  db: Db,
  input: { code: string; phone: string; name: string; pin: string },
  nowIso: string,
) {
  const phone = normalizePhone(input.phone)
  const code = db.select().from(schema.inviteCodes)
    .where(eq(schema.inviteCodes.code, input.code)).get()
  if (!code || code.usedCount >= code.maxUses || Date.parse(code.expiresAt) < Date.parse(nowIso))
    throw err('invalid or expired invite code', 400)
  if (db.select().from(schema.players).where(eq(schema.players.phone, phone)).get())
    throw err('phone already registered', 409)
  if (!input.name.trim()) throw err('name required', 400)

  const pinHash = hashPin(input.pin) // throws "PIN must be exactly 6 digits"
  const player = db.insert(schema.players).values({
    phone, pinHash, displayName: input.name.trim(), createdAt: nowIso,
  }).returning().get()
  db.update(schema.inviteCodes).set({ usedCount: code.usedCount + 1 })
    .where(eq(schema.inviteCodes.id, code.id)).run()
  return player
}

export function loginPlayer(db: Db, rawPhone: string, pin: string, nowIso: string) {
  const phone = normalizePhone(rawPhone)
  const p = db.select().from(schema.players).where(eq(schema.players.phone, phone)).get()
  if (!p) throw err('wrong phone or PIN', 401)
  // Caller contract: check lockState BEFORE verifyPin; never call registerFailure while locked
  if (lockState(p, nowIso).locked) throw err('account locked — try later or ask admin', 423)

  if (!verifyPin(pin, p.pinHash)) {
    const next = registerFailure(p, nowIso)
    db.update(schema.players).set(next).where(eq(schema.players.id, p.id)).run()
    throw err('wrong phone or PIN', 401)
  }
  // Use registerSuccess() per deviation #1 (intentional)
  db.update(schema.players).set(registerSuccess())
    .where(eq(schema.players.id, p.id)).run()
  return { player: { ...p, ...registerSuccess() } }
}

export function changePin(db: Db, playerId: number, currentPin: string, newPin: string) {
  const p = db.select().from(schema.players).where(eq(schema.players.id, playerId)).get()
  if (!p) throw err('not found', 404)
  if (!verifyPin(currentPin, p.pinHash)) throw err('current PIN incorrect', 401)
  db.update(schema.players).set({
    pinHash: hashPin(newPin), mustChangePin: false, sessionEpoch: p.sessionEpoch + 1,
  }).where(eq(schema.players.id, playerId)).run()
}
