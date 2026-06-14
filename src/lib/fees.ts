export function roundHalfAwayFromZero(x: number): number {
  const r = Math.sign(x) * Math.round(Math.abs(x));
  return r === 0 ? 0 : r;
}

/** Signed fee adjustment to a bet's net. commissionPct/discountPct are integer percents. */
export function computeFee(
  netMmk: number,
  commissionPct: number,
  discountPct: number,
): number {
  if (netMmk > 0)
    return -roundHalfAwayFromZero((commissionPct * netMmk) / 100) || 0;
  if (netMmk < 0)
    return roundHalfAwayFromZero((discountPct * -netMmk) / 100) || 0;
  return 0;
}
