import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb, schema, type Db } from '@/lib/db'
import { registerPlayer, loginPlayer, changePin } from './flows'
import { hashPin } from './pin'

let db: Db
const NOW = '2026-06-12T10:00:00Z'

beforeEach(() => {
  db = createTestDb()
  db.insert(schema.players).values({
    phone: '09700000001', pinHash: hashPin('111111'), displayName: 'Admin',
    role: 'admin', createdAt: NOW,
  }).run()
  db.insert(schema.inviteCodes).values({
    code: 'JOIN26', maxUses: 5, usedCount: 0, expiresAt: '2026-12-31T00:00:00Z', createdBy: 1,
  }).run()
})

describe('registerPlayer', () => {
  it('happy path consumes invite and normalizes phone', () => {
    const p = registerPlayer(db, { code: 'JOIN26', phone: '+959790001111', name: 'Ko Zaw', pin: '222222' }, NOW)
    expect(p.phone).toBe('09790001111')
    expect(db.select().from(schema.inviteCodes).all()[0].usedCount).toBe(1)
  })
  it('rejects expired/exhausted/unknown codes and duplicate phones', () => {
    expect(() => registerPlayer(db, { code: 'NOPE', phone: '09790001111', name: 'X', pin: '222222' }, NOW)).toThrow(/invite/)
    registerPlayer(db, { code: 'JOIN26', phone: '09790001111', name: 'X', pin: '222222' }, NOW)
    expect(() => registerPlayer(db, { code: 'JOIN26', phone: '0979 000 1111', name: 'Y', pin: '333333' }, NOW)).toThrow(/already/)
    expect(() => registerPlayer(db, { code: 'JOIN26', phone: '09790001112', name: 'Z', pin: '4444' }, NOW)).toThrow(/PIN/)
  })
  it('rejects an expired invite code', () => {
    db.insert(schema.inviteCodes).values({
      code: 'EXPIRED', maxUses: 5, usedCount: 0, expiresAt: '2026-01-01T00:00:00Z', createdBy: 1,
    }).run()
    expect(() => registerPlayer(db, { code: 'EXPIRED', phone: '09790002222', name: 'X', pin: '222222' }, NOW)).toThrow(/invite/)
  })
  it('rejects an exhausted invite code after one successful registration', () => {
    db.insert(schema.inviteCodes).values({
      code: 'ONCE', maxUses: 1, usedCount: 0, expiresAt: '2026-12-31T00:00:00Z', createdBy: 1,
    }).run()
    registerPlayer(db, { code: 'ONCE', phone: '09790003333', name: 'First', pin: '222222' }, NOW)
    expect(() => registerPlayer(db, { code: 'ONCE', phone: '09790004444', name: 'Second', pin: '333333' }, NOW)).toThrow(/invite/)
  })
})

describe('loginPlayer', () => {
  it('succeeds, resets failure count, fails wrong pin, locks after 5', () => {
    expect(loginPlayer(db, '09700000001', '111111', NOW).player.displayName).toBe('Admin')
    for (let k = 0; k < 5; k++) {
      expect(() => loginPlayer(db, '09700000001', '999999', NOW)).toThrow()
    }
    // locked now, even with the right PIN
    expect(() => loginPlayer(db, '09700000001', '111111', NOW)).toThrow(/locked/)
    // after lock expires it works and clears counters
    const later = '2026-06-12T10:20:00Z'
    expect(loginPlayer(db, '09700000001', '111111', later).player.failedPinAttempts).toBe(0)
  })
})

describe('changePin', () => {
  it('requires current pin, bumps sessionEpoch, clears mustChangePin', () => {
    expect(() => changePin(db, 1, '000000', '222222')).toThrow(/current/i)
    const before = db.select().from(schema.players).all()[0].sessionEpoch
    changePin(db, 1, '111111', '222222')
    const after = db.select().from(schema.players).all()[0]
    expect(after.sessionEpoch).toBe(before + 1)
    expect(loginPlayer(db, '09700000001', '222222', NOW).player.id).toBe(1)
  })
  it('locks after 5 wrong currentPin attempts and rejects even correct pin on 6th', () => {
    for (let k = 0; k < 5; k++) {
      expect(() => changePin(db, 1, '000000', '222222')).toThrow()
    }
    expect(() => changePin(db, 1, '111111', '222222')).toThrow(/locked/i)
  })
  it('returns the updated row with bumped sessionEpoch', () => {
    const before = db.select().from(schema.players).all()[0].sessionEpoch
    const updated = changePin(db, 1, '111111', '222222')
    expect(updated.sessionEpoch).toBe(before + 1)
    expect(updated.mustChangePin).toBe(false)
  })
  it('throws on bad input types', () => {
    expect(() => loginPlayer(db, 123 as never, '111111', NOW)).toThrow(/invalid input/)
  })
})
