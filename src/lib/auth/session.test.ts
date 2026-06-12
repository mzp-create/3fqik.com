import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SignJWT } from 'jose'
import { createSessionToken, verifySessionToken } from './session'

describe('session tokens', () => {
  let originalSecret: string | undefined

  beforeEach(() => {
    originalSecret = process.env.SESSION_SECRET
    process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret!'
  })

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.SESSION_SECRET
    } else {
      process.env.SESSION_SECRET = originalSecret
    }
  })

  it('round-trips and respects sessionEpoch', async () => {
    const tok = await createSessionToken({ playerId: 7, role: 'admin', epoch: 2 })
    const s = await verifySessionToken(tok)
    expect(s).toEqual({ playerId: 7, role: 'admin', epoch: 2 })
    expect(await verifySessionToken(tok + 'x')).toBeNull()
  })

  it('rejects expired tokens', async () => {
    const tok = await new SignJWT({ playerId: 7, role: 'player', epoch: 0 })
      .setProtectedHeader({ alg: 'HS256' }).setExpirationTime('-10s')
      .sign(new TextEncoder().encode(process.env.SESSION_SECRET!))
    expect(await verifySessionToken(tok)).toBeNull()
  })

  it('rejects tokens signed with a different secret', async () => {
    process.env.SESSION_SECRET = 'wrong-secret-wrong-secret-wrong-secret'
    const tok = await createSessionToken({ playerId: 7, role: 'player', epoch: 0 })
    process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret!'
    expect(await verifySessionToken(tok)).toBeNull()
  })

  it('rejects wrong-typed claims', async () => {
    const tok = await new SignJWT({ playerId: '7', role: 'player', epoch: 0 })
      .setProtectedHeader({ alg: 'HS256' }).setExpirationTime('30d')
      .sign(new TextEncoder().encode(process.env.SESSION_SECRET!))
    expect(await verifySessionToken(tok)).toBeNull()
  })
})
