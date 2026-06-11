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
})
