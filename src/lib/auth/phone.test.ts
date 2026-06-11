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
  it('rejects internal or repeated plus signs and bare-9 forms', () => {
    expect(() => normalizePhone('09790+001111')).toThrow()
    expect(() => normalizePhone('+++09790001111')).toThrow()
    expect(() => normalizePhone('9+59790001111')).toThrow()
    expect(() => normalizePhone('9790001111')).toThrow() // bare 9, ambiguous
  })
  it('rejects non-ASCII digits', () => {
    expect(() => normalizePhone('09၇၉၀001111')).toThrow()
  })
  it('accepts spec length bounds 09+7 and 09+10, rejects outside', () => {
    expect(normalizePhone('091234567')).toBe('091234567')
    expect(normalizePhone('091234567890')).toBe('091234567890')
    expect(() => normalizePhone('09123456')).toThrow()
    expect(() => normalizePhone('0912345678901')).toThrow()
  })
})
