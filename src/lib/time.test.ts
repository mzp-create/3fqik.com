import { describe, it, expect } from 'vitest'
import { matchDayOf, formatMmt } from './time'

describe('time', () => {
  it('derives match_day from kickoff in Asia/Yangon', () => {
    // 2026-06-11 19:30 UTC = 2026-06-12 02:00 MMT → match day 2026-06-12
    expect(matchDayOf('2026-06-11T19:30:00Z')).toBe('2026-06-12')
    // 2026-06-11 17:00 UTC = 2026-06-11 23:30 MMT → stays 2026-06-11
    expect(matchDayOf('2026-06-11T17:00:00Z')).toBe('2026-06-11')
  })
  it('formats display time in MMT', () => {
    expect(formatMmt('2026-06-11T19:30:00Z')).toMatch(/12 Jun.*02:00/)
  })
})
