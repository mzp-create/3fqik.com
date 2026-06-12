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

// NOTE: a 6-digit PIN (10^6 keyspace) is trivially brute-forced offline at any
// bcrypt cost if pin_hash leaks. The real defense is the online lockout below;
// cost 10 just keeps casual inspection out.
//
// Caller contract: check lockState() BEFORE verifyPin(); do not call
// registerFailure() while locked (it would extend the lock); call
// registerSuccess() fields on successful login.

export type LockFields = { failedPinAttempts: number; lockedUntil: string | null }

export function registerFailure(p: LockFields, nowIso: string): LockFields {
  const lockExpired = !!p.lockedUntil && Date.parse(p.lockedUntil) <= Date.parse(nowIso)
  const failed = (lockExpired ? 0 : p.failedPinAttempts) + 1
  return {
    failedPinAttempts: failed,
    lockedUntil: failed >= MAX_ATTEMPTS
      ? new Date(Date.parse(nowIso) + LOCK_MINUTES * 60_000).toISOString()
      : lockExpired ? null : p.lockedUntil,
  }
}

export function registerSuccess(): LockFields {
  return { failedPinAttempts: 0, lockedUntil: null }
}

export function lockState(p: LockFields, nowIso: string): { locked: boolean } {
  return { locked: !!p.lockedUntil && Date.parse(p.lockedUntil) > Date.parse(nowIso) }
}
