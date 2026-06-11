import { describe, it, expect } from 'vitest'
import { sseHub } from './sse'

describe('sseHub', () => {
  it('delivers broadcast events to subscribers and stops after unsubscribe', () => {
    const got: string[] = []
    const unsub = sseHub.subscribe(chunk => got.push(chunk))
    sseHub.broadcast('line_update', { matchId: 3, version: 7 })
    unsub()
    sseHub.broadcast('line_update', { matchId: 3, version: 8 })
    expect(got).toHaveLength(1)
    expect(got[0]).toBe('event: line_update\ndata: {"matchId":3,"version":7}\n\n')
  })
})
