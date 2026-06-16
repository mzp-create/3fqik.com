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

/** Tomorrow's date in MMT, formatted YYYY-MM-DD. */
export function tomorrowMmt(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Yangon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(Date.now() + 86400000));
}

/** Friendly heading for a match day (YYYY-MM-DD) plus a relative tag. */
export function dayLabel(
  day: string,
  today: string,
  tomorrow: string,
): { formatted: string; tag: "Today" | "Tomorrow" | "Overdue" | null } {
  const [y, mo, d] = day.split("-").map(Number);
  const formatted = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, mo - 1, d)));
  const tag =
    day === today
      ? "Today"
      : day === tomorrow
        ? "Tomorrow"
        : day < today
          ? "Overdue"
          : null;
  return { formatted, tag };
}

const KNOCKOUT: Record<
  string,
  { label: string; labelKey: string; order: number }
> = {
  R32: { label: "Round of 32", labelKey: "roundOf32", order: 12 },
  R16: { label: "Round of 16", labelKey: "roundOf16", order: 13 },
  QF: { label: "Quarter-finals", labelKey: "quarterFinals", order: 14 },
  SF: { label: "Semi-finals", labelKey: "semiFinals", order: 15 },
  Bronze: { label: "Third place", labelKey: "thirdPlace", order: 16 },
  Final: { label: "Final", labelKey: "finalRound", order: 17 },
};

/**
 * Maps a match `stage` to a display section for FotMob-style grouping.
 * Groups A–L sort first (order 0–11), then knockout rounds. `labelKey` is an
 * i18n key for knockout rounds (null for groups, whose label is the proper noun
 * "Group X"); components use `t[labelKey] ?? label`.
 */
export function stageSection(stage: string): {
  key: string;
  label: string;
  labelKey: string | null;
  kind: "group" | "knockout";
  order: number;
} {
  if (stage.startsWith("Group ")) {
    const letter = stage.slice(6);
    return {
      key: stage,
      label: stage,
      labelKey: null,
      kind: "group",
      order: letter.charCodeAt(0) - 65, // 'A' → 0 … 'L' → 11
    };
  }
  const k = KNOCKOUT[stage];
  if (k)
    return {
      key: stage,
      label: k.label,
      labelKey: k.labelKey,
      kind: "knockout",
      order: k.order,
    };
  return {
    key: stage,
    label: stage,
    labelKey: null,
    kind: "knockout",
    order: 99,
  };
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
