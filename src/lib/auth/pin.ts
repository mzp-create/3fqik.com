import bcrypt from 'bcryptjs'

export const MAX_ATTEMPTS = 5
export const LOCK_MINUTES = 15

export function hashPin(pin: string): string {
  if (!/^\d{6}$/.test(pin)) throw new Error('PIN must be exactly 6 digits')
  return bcrypt.hashSync(pin, 10)
}

export function verifyPin(pin: string, hash: string): boolean {
  return bcrypt.compareSync(pin, hash)
}

type LockFields = { failedPinAttempts: number; lockedUntil: string | null }

export function registerFailure(p: LockFields, nowIso: string): LockFields {
  const failed = p.failedPinAttempts + 1
  return {
    failedPinAttempts: failed,
    lockedUntil: failed >= MAX_ATTEMPTS
      ? new Date(Date.parse(nowIso) + LOCK_MINUTES * 60_000).toISOString()
      : p.lockedUntil,
  }
}

export function lockState(p: LockFields, nowIso: string): { locked: boolean } {
  return { locked: !!p.lockedUntil && Date.parse(p.lockedUntil) > Date.parse(nowIso) }
}
