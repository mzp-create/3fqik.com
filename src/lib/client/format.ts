export const mmk = (n: number) => n.toLocaleString("en-US");
export const signedMmk = (n: number) =>
  (n > 0 ? "+" : "") + n.toLocaleString("en-US");
export const ball = (q: number) => (q / 4).toString();
export const price = (c: number) => (c / 100).toFixed(2);
export function pickLabel(
  l: { favSide: "home" | "away"; ballQ: number; priceC: number },
  m: { homeTeam: string; awayTeam: string },
  side: "fav" | "dog",
) {
  const fav = l.favSide === "home" ? m.homeTeam : m.awayTeam;
  const dog = l.favSide === "home" ? m.awayTeam : m.homeTeam;
  return side === "fav"
    ? `${fav} −${ball(l.ballQ)} @ ${price(l.priceC)}`
    : `${dog} +${ball(l.ballQ)} @ ${price(l.priceC)}`;
}
