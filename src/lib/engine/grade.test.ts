import { describe, it, expect } from 'vitest'
import { gradeBet } from './grade'

type Case = {
  name: string
  side: 'fav' | 'dog'; ballQ: number; priceC: number; stake: number
  effFav: number; effDog: number
  status: string; net: number
}

const T: Case[] = [
  // ---- full ball (ballQ multiple of 4): pushes possible
  { name: 'fav -1.0 wins by 2',  side: 'fav', ballQ: 4, priceC: 92,  stake: 100_000, effFav: 2, effDog: 0, status: 'won',  net: 92_000 },
  { name: 'fav -1.0 wins by 1 → push', side: 'fav', ballQ: 4, priceC: 92, stake: 100_000, effFav: 1, effDog: 0, status: 'push', net: 0 },
  { name: 'fav -1.0 draws → lost', side: 'fav', ballQ: 4, priceC: 92, stake: 100_000, effFav: 0, effDog: 0, status: 'lost', net: -100_000 },
  { name: 'dog +1.0 loses by 1 → push', side: 'dog', ballQ: 4, priceC: -98, stake: 100_000, effFav: 1, effDog: 0, status: 'push', net: 0 },
  { name: 'dog +1.0 draws → won (neg price wins stake)', side: 'dog', ballQ: 4, priceC: -98, stake: 100_000, effFav: 0, effDog: 0, status: 'won', net: 100_000 },
  { name: 'dog +1.0 loses by 2 → lost (neg price)', side: 'dog', ballQ: 4, priceC: -98, stake: 100_000, effFav: 2, effDog: 0, status: 'lost', net: -98_000 },

  // ---- half ball (ballQ ≡ 2 mod 4): no pushes
  { name: 'fav -0.5 wins by 1', side: 'fav', ballQ: 2, priceC: 85, stake: 200_000, effFav: 1, effDog: 0, status: 'won', net: 170_000 },
  { name: 'fav -0.5 draws → lost', side: 'fav', ballQ: 2, priceC: 85, stake: 200_000, effFav: 0, effDog: 0, status: 'lost', net: -200_000 },
  { name: 'dog +0.5 draws → won', side: 'dog', ballQ: 2, priceC: -95, stake: 300_000, effFav: 0, effDog: 0, status: 'won', net: 300_000 },
  { name: 'dog +0.5 loses by 1 → lost', side: 'dog', ballQ: 2, priceC: -95, stake: 300_000, effFav: 1, effDog: 0, status: 'lost', net: -285_000 },

  // ---- quarter ball: split halves
  // fav -0.75 @0.92, stake 100k, wins by 1: half -0.5 wins (+46,000), half -1.0 pushes → half_won
  { name: 'fav -0.75 wins by 1 → half_won', side: 'fav', ballQ: 3, priceC: 92, stake: 100_000, effFav: 1, effDog: 0, status: 'half_won', net: 46_000 },
  { name: 'fav -0.75 wins by 2 → won', side: 'fav', ballQ: 3, priceC: 92, stake: 100_000, effFav: 2, effDog: 0, status: 'won', net: 92_000 },
  { name: 'fav -0.75 draws → lost', side: 'fav', ballQ: 3, priceC: 92, stake: 100_000, effFav: 0, effDog: 0, status: 'lost', net: -100_000 },
  // fav -0.25 @-0.90, stake 100k, draw: half 0 pushes, half -0.5 loses 45,000 → half_lost
  { name: 'fav -0.25 neg price draws → half_lost', side: 'fav', ballQ: 1, priceC: -90, stake: 100_000, effFav: 0, effDog: 0, status: 'half_lost', net: -45_000 },
  // dog +0.25 @-0.98 draw: half +0 pushes, half +0.5 wins 50,000 → half_won
  { name: 'dog +0.25 neg price draws → half_won', side: 'dog', ballQ: 1, priceC: -98, stake: 100_000, effFav: 0, effDog: 0, status: 'half_won', net: 50_000 },
  { name: 'dog +0.25 loses by 1 → lost', side: 'dog', ballQ: 1, priceC: -98, stake: 100_000, effFav: 1, effDog: 0, status: 'lost', net: -98_000 },

  // ---- live bet: effective score already offset by caller; same math
  // bet at 1-0 on dog +0.75 @0.90, final 2-1 → eff 1-1, diff 0 →
  // halves +0.5 and +1.0 both win; priceC 90 > 0 so each pays S/2 × 0.90 = 45,000 → won, +90,000
  { name: 'live dog +0.75 eff draw → won', side: 'dog', ballQ: 3, priceC: 90, stake: 100_000, effFav: 1, effDog: 1, status: 'won', net: 90_000 },

  // ---- ball 0 (level): pure push possibilities
  { name: 'level ball draw → push', side: 'fav', ballQ: 0, priceC: 95, stake: 50_000, effFav: 1, effDog: 1, status: 'push', net: 0 },

  // ---- odd stake rounding: half stakes round half-away-from-zero once at the end
  { name: 'quarter ball odd stake rounds', side: 'fav', ballQ: 3, priceC: 85, stake: 33_333, effFav: 1, effDog: 0, status: 'half_won', net: 14_167 }, // 16666.5*0.85 = 14166.525 → 14167
]

describe('gradeBet', () => {
  for (const c of T) {
    it(c.name, () => {
      const r = gradeBet({ side: c.side, ballQ: c.ballQ, priceC: c.priceC,
        stake: c.stake, effFav: c.effFav, effDog: c.effDog })
      expect(r.status).toBe(c.status)
      expect(r.netMmk).toBe(c.net)
    })
  }

  it('rejects invalid inputs', () => {
    expect(() => gradeBet({ side: 'fav', ballQ: -1, priceC: 92, stake: 1000, effFav: 0, effDog: 0 })).toThrow()
    expect(() => gradeBet({ side: 'fav', ballQ: 0, priceC: 0, stake: 1000, effFav: 0, effDog: 0 })).toThrow()
    expect(() => gradeBet({ side: 'fav', ballQ: 0, priceC: 92, stake: 0, effFav: 0, effDog: 0 })).toThrow()
  })
})
