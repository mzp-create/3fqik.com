import { describe, it, expect } from 'vitest'
import { normalizePhone } from './phone'

describe('normalizePhone', () => {
  it('treats 09x, +959x, 959x, spaced/dashed as one identity', () => {
    expect(normalizePhone('09790001111')).toBe('09790001111')
    expect(normalizePhone('+959790001111')).toBe('09790001111')
    expect(normalizePhone('959790001111')).toBe('09790001111')
    expect(normalizePhone('09 790 001 111')).toBe('09790001111')
    expect(normalizePhone('09-790-001-111')).toBe('09790001111')
  })
  it('rejects garbage', () => {
    for (const bad of ['', '123', 'abc', '0812345', '0979000111122334']) {
      expect(() => normalizePhone(bad)).toThrow()
    }
  })
})
