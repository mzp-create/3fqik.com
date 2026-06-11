import { describe, it, expect } from 'vitest'
import { createTestDb, schema } from './index'

describe('db schema', () => {
  it('round-trips a player and enforces unique phone', () => {
    const db = createTestDb()
    db.insert(schema.players).values({
      phone: '09790001111', pinHash: 'x', displayName: 'Ko Zaw',
      createdAt: new Date().toISOString(),
    }).run()
    const all = db.select().from(schema.players).all()
    expect(all).toHaveLength(1)
    expect(() =>
      db.insert(schema.players).values({
        phone: '09790001111', pinHash: 'y', displayName: 'Dup',
        createdAt: new Date().toISOString(),
      }).run(),
    ).toThrow(/UNIQUE/)
  })
})
