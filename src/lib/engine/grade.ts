export type GradeInput = {
  side: 'fav' | 'dog'
  ballQ: number      // handicap ×4, integer ≥ 0
  priceC: number     // Malay price ×100, integer, −100 ≤ p ≤ 100, p ≠ 0
  stake: number      // MMK, integer > 0
  effFav: number     // favorite's goals counted for this bet
  effDog: number
}

export type GradeResult = {
  status: 'won' | 'half_won' | 'push' | 'half_lost' | 'lost'
  netMmk: number
}

type HalfOutcome = 'win' | 'push' | 'lose'

function halfOutcome(side: 'fav' | 'dog', ballQ: number, effFav: number, effDog: number): HalfOutcome {
  const diffQ = 4 * (effFav - effDog)
  const m = side === 'fav' ? diffQ - ballQ : ballQ - diffQ
  return m > 0 ? 'win' : m === 0 ? 'push' : 'lose'
}

/** Exact (unrounded) net for a half-stake with Malay price. */
function halfNet(outcome: HalfOutcome, halfStake: number, priceC: number): number {
  if (outcome === 'push') return 0
  if (priceC > 0) return outcome === 'win' ? (halfStake * priceC) / 100 : -halfStake
  return outcome === 'win' ? halfStake : -(halfStake * -priceC) / 100
}

function roundHalfAwayFromZero(x: number): number {
  return Math.sign(x) * Math.round(Math.abs(x))
}

export function gradeBet(i: GradeInput): GradeResult {
  if (!Number.isInteger(i.ballQ) || i.ballQ < 0) throw new Error('invalid ballQ')
  if (!Number.isInteger(i.priceC) || i.priceC === 0 || i.priceC < -100 || i.priceC > 100)
    throw new Error('invalid priceC')
  if (!Number.isInteger(i.stake) || i.stake <= 0) throw new Error('invalid stake')
  if (!Number.isInteger(i.effFav) || !Number.isInteger(i.effDog) || i.effFav < 0 || i.effDog < 0)
    throw new Error('invalid effective score')

  const quarter = i.ballQ % 2 === 1
  const parts: Array<{ ballQ: number; stake: number }> = quarter
    ? [{ ballQ: i.ballQ - 1, stake: i.stake / 2 }, { ballQ: i.ballQ + 1, stake: i.stake / 2 }]
    : [{ ballQ: i.ballQ, stake: i.stake }]

  const outcomes = parts.map(p => halfOutcome(i.side, p.ballQ, i.effFav, i.effDog))
  const exactNet = parts.reduce((sum, p, k) => sum + halfNet(outcomes[k], p.stake, i.priceC), 0)
  const netMmk = roundHalfAwayFromZero(exactNet)

  const wins = outcomes.filter(o => o === 'win').length
  const loses = outcomes.filter(o => o === 'lose').length
  const n = outcomes.length

  let status: GradeResult['status']
  if (wins === n) status = 'won'
  else if (loses === n) status = 'lost'
  else if (wins > 0) status = 'half_won'
  else if (loses > 0) status = 'half_lost'
  else status = 'push'

  return { status, netMmk }
}
