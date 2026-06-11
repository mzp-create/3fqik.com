import { describe, it, expect } from 'vitest'
import { hashPin, verifyPin, lockState, registerFailure, LOCK_MINUTES, MAX_ATTEMPTS } from './pin'

describe('pin', () => {
  it('hashes and verifies', () => {
    const h = hashPin('123456')
    expect(verifyPin('123456', h)).toBe(true)
    expect(verifyPin('654321', h)).toBe(false)
    expect(() => hashPin('12345')).toThrow()   // must be exactly 6 digits
    expect(() => hashPin('abcdef')).toThrow()
  })
  it('locks after MAX_ATTEMPTS failures for LOCK_MINUTES', () => {
    let p = { failedPinAttempts: 0, lockedUntil: null as string | null }
    for (let k = 0; k < MAX_ATTEMPTS; k++) p = registerFailure(p, '2026-06-12T10:00:00Z')
    expect(p.failedPinAttempts).toBe(MAX_ATTEMPTS)
    expect(p.lockedUntil).toBe(new Date(Date.parse('2026-06-12T10:00:00Z') + LOCK_MINUTES * 60_000).toISOString())
    expect(lockState(p, '2026-06-12T10:05:00Z').locked).toBe(true)
    expect(lockState(p, '2026-06-12T10:16:00Z').locked).toBe(false)
  })
})
