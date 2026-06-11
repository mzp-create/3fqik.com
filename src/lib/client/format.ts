export const mmk = (n: number) => n.toLocaleString("en-US");
export const signedMmk = (n: number) =>
  (n > 0 ? "+" : "") + n.toLocaleString("en-US");
export const ball = (q: number) => (q / 4).toString();
export const price = (c: number) => (c / 100).toFixed(2);

/** Today's date in Myanmar Time (MMT, UTC+6:30), formatted YYYY-MM-DD. */
export function todayMmt(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Yangon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export function pickLabel(
  l: {
    favSide: "home" | "away";
    ballQ: number;
    priceC: number;
    market?: "ah" | "ou";
  },
  m: { homeTeam: string; awayTeam: string },
  side: "fav" | "dog" | "over" | "under",
  ouLabels?: { over: string; under: string },
) {
  if (l.market === "ou" || side === "over" || side === "under") {
    const labels = ouLabels ?? { over: "Over", under: "Under" };
    const word = side === "over" ? labels.over : labels.under;
    return `${word} ${ball(l.ballQ)} @ ${price(l.priceC)}`;
  }
  const fav = l.favSide === "home" ? m.homeTeam : m.awayTeam;
  const dog = l.favSide === "home" ? m.awayTeam : m.homeTeam;
  return side === "fav"
    ? `${fav} −${ball(l.ballQ)} @ ${price(l.priceC)}`
    : `${dog} +${ball(l.ballQ)} @ ${price(l.priceC)}`;
}
