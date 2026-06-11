import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb, schema, type Db } from '@/lib/db'
import { hashPin, verifyPin } from './pin'
import { createInvite, resetPin, unlockPlayer, grantAdmin } from './adminActions'

let db: Db
const NOW = '2026-06-12T10:00:00Z'

beforeEach(() => {
  db = createTestDb()
  db.insert(schema.players).values([
    { phone: '09700000001', pinHash: hashPin('111111'), displayName: 'Admin', role: 'admin', createdAt: NOW },
    { phone: '09700000002', pinHash: hashPin('222222'), displayName: 'Zaw', createdAt: NOW },
  ]).run()
})

it('createInvite generates an 6-char unambiguous code', () => {
  const inv = createInvite(db, 1, { maxUses: 10, expiresAt: '2026-07-20T00:00:00Z' })
  expect(inv.code).toMatch(/^[2-9A-HJ-NP-Z]{6}$/)
})

it('resetPin sets temp pin, forces change, bumps epoch, audit-logs', () => {
  const before = db.select().from(schema.players).all()[1]
  resetPin(db, 1, 2, '999999', NOW)
  const after = db.select().from(schema.players).all()[1]
  expect(verifyPin('999999', after.pinHash)).toBe(true)
  expect(after.mustChangePin).toBe(true)
  expect(after.sessionEpoch).toBe(before.sessionEpoch + 1)
  expect(db.select().from(schema.auditLog).all()[0].action).toBe('pin_reset')
})

it('unlockPlayer clears lock; grantAdmin flips role; both audit-log', () => {
  db.update(schema.players).set({ failedPinAttempts: 5, lockedUntil: '2026-06-12T10:15:00Z' }).run()
  unlockPlayer(db, 1, 2, NOW)
  expect(db.select().from(schema.players).all()[1].lockedUntil).toBeNull()
  grantAdmin(db, 1, 2, NOW)
  expect(db.select().from(schema.players).all()[1].role).toBe('admin')
  expect(db.select().from(schema.auditLog).all().map(a => a.action)).toEqual(['unlock', 'grant_admin'])
})
