import { describe, it, expect } from 'vitest'
import { createSessionToken, verifySessionToken } from './session'

describe('session tokens', () => {
  it('round-trips and respects sessionEpoch', async () => {
    process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret!'
    const tok = await createSessionToken({ playerId: 7, role: 'admin', epoch: 2 })
    const s = await verifySessionToken(tok)
    expect(s).toEqual({ playerId: 7, role: 'admin', epoch: 2 })
    expect(await verifySessionToken(tok + 'x')).toBeNull()
  })
})
