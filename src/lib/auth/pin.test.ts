import { describe, it, expect } from 'vitest'
import { hashPin, verifyPin, lockState, registerFailure, registerSuccess, LOCK_MINUTES, MAX_ATTEMPTS } from './pin'

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
  it('does not lock before MAX_ATTEMPTS', () => {
    let p = { failedPinAttempts: 0, lockedUntil: null as string | null }
    for (let k = 0; k < MAX_ATTEMPTS - 1; k++) p = registerFailure(p, '2026-06-12T10:00:00Z')
    expect(p.lockedUntil).toBeNull()
    expect(lockState(p, '2026-06-12T10:00:00Z').locked).toBe(false)
  })
  it('grants a fresh window of attempts after the lock expires', () => {
    let p = { failedPinAttempts: 0, lockedUntil: null as string | null }
    for (let k = 0; k < MAX_ATTEMPTS; k++) p = registerFailure(p, '2026-06-12T10:00:00Z')
    p = registerFailure(p, '2026-06-12T10:30:00Z')
    expect(lockState(p, '2026-06-12T10:30:01Z').locked).toBe(false)
    expect(p.failedPinAttempts).toBe(1)
  })
  it('success resets lock fields', () => {
    expect(registerSuccess()).toEqual({ failedPinAttempts: 0, lockedUntil: null })
  })
  it('unlocks exactly at the boundary instant', () => {
    const p = { failedPinAttempts: 5, lockedUntil: '2026-06-12T10:15:00.000Z' }
    expect(lockState(p, '2026-06-12T10:15:00.000Z').locked).toBe(false)
  })
})
