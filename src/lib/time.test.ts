import { describe, it, expect } from 'vitest'
import { matchDayOf, formatMmt, nowIso } from './time'

describe('time', () => {
  it('derives match_day from kickoff in Asia/Yangon', () => {
    // 2026-06-11 19:30 UTC = 2026-06-12 02:00 MMT → match day 2026-06-12
    expect(matchDayOf('2026-06-11T19:30:00Z')).toBe('2026-06-12')
    // 2026-06-11 17:00 UTC = 2026-06-11 23:30 MMT → stays 2026-06-11
    expect(matchDayOf('2026-06-11T17:00:00Z')).toBe('2026-06-11')
  })
  it('handles exact midnight boundary in Asia/Yangon', () => {
    // MMT is UTC+06:30; 17:29:59Z = 23:59:59 MMT → still 2026-06-11
    expect(matchDayOf('2026-06-11T17:29:59Z')).toBe('2026-06-11')
    // 17:30:00Z = 00:00:00 MMT next day → 2026-06-12
    expect(matchDayOf('2026-06-11T17:30:00Z')).toBe('2026-06-12')
  })
  it('throws TypeError for invalid input', () => {
    expect(() => matchDayOf('garbage')).toThrow(TypeError)
  })
  it('formats display time in MMT', () => {
    expect(formatMmt('2026-06-11T19:30:00Z')).toBe('12 Jun, 02:00')
  })
  it('nowIso returns a valid ISO 8601 UTC string', () => {
    expect(nowIso()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })
})
