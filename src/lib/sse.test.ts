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

  it('broadcast reaches second listener even when first throws', () => {
    const got: string[] = []
    const unsub1 = sseHub.subscribe(() => { throw new Error('boom') })
    const unsub2 = sseHub.subscribe(chunk => got.push(chunk))
    expect(() => sseHub.broadcast('test_event', { x: 1 })).not.toThrow()
    unsub1()
    unsub2()
    expect(got).toHaveLength(1)
    expect(got[0]).toBe('event: test_event\ndata: {"x":1}\n\n')
  })
})
