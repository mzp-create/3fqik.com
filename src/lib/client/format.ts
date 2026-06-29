export const mmk = (n: number) => n.toLocaleString("en-US");
export const signedMmk = (n: number) =>
  (n > 0 ? "+" : "") + n.toLocaleString("en-US");
export const ball = (q: number) => (q / 4).toString();
export const price = (c: number) => (c / 100).toFixed(2);
/** Signed Malay price, e.g. +35 → "+0.35", −90 → "−0.90". */
export const priceSigned = (c: number) =>
  (c > 0 ? "+" : "−") + (Math.abs(c) / 100).toFixed(2);

/** "2–1" (en-dash) only when the match is finished and both scores are present;
 *  otherwise null. Caller-agnostic — pass the match status plus the two scores
 *  from whichever shape the caller has (nested match.* for bets, flat
 *  matchStatus/finalHomeScore for balance). Used to show a final result line so
 *  players can cross-reference grading. */
export function finalScore(
  status: string | undefined,
  homeScore: number | null | undefined,
  awayScore: number | null | undefined,
): string | null {
  if (status !== "finished" || homeScore == null || awayScore == null)
    return null;
  return `${homeScore}–${awayScore}`;
}

/** A match is "started" (betting closed) once it is live/finished OR its kickoff
 *  time has passed. Mirrors the server-side placement guard. */
export function matchStarted(m: {
  status: string;
  kickoffUtc: string;
}): boolean {
  return (
    m.status !== "scheduled" || new Date(m.kickoffUtc).getTime() <= Date.now()
  );
}

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

/** Yesterday's date in MMT, formatted YYYY-MM-DD. */
export function yesterdayMmt(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Yangon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(Date.now() - 86_400_000));
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
/**
 * Plain-language "what result wins this bet", derived from the grading model
 * (grade.ts): AH wins when margin > N (fav) / < N (dog); O/U when total > N
 * (over) / < N (under); a whole-number line pushes (stake back) on exact N.
 * `value` is goals-since-bet, so for a LIVE bet the condition is "from now".
 * Returns the win sentence plus an optional push (stake-back) note.
 */
export function winNeed(opts: {
  market: "ah" | "ou";
  side: "fav" | "dog" | "over" | "under";
  ballQ: number;
  favName: string;
  dogName: string;
  live: boolean;
}): { text: string; push?: string; half?: string } {
  const { market, side, ballQ, favName, dogName, live } = opts;
  const N = ballQ / 4;
  const whole = ballQ % 4 === 0;
  const quarter = ballQ % 2 === 1;
  const from = live ? " from now" : "";
  // Leg lines: a quarter splits into the two nearest lines; the integer one is
  // where a leg can push (→ a half outcome). The non-integer leg never pushes.
  const legs = quarter ? [(ballQ - 1) / 4, (ballQ + 1) / 4] : [N];
  const intLeg = legs.find((l) => Number.isInteger(l));

  if (market === "ou") {
    if (side === "over") {
      const hi = Math.max(...legs);
      const min = Math.floor(hi) + 1; // smallest integer total > the farther leg
      const push = whole
        ? `exactly ${N} goal${N === 1 ? "" : "s"}${from} — stake back`
        : undefined;
      // over half: total === intLeg. Upper int leg (N=k.75) → half-win; lower (N=k.25) → half-loss.
      const half =
        quarter && intLeg !== undefined
          ? `exactly ${intLeg} goal${intLeg === 1 ? "" : "s"}${from} — ${intLeg === Math.max(...legs) ? "half win" : "half loss"}`
          : undefined;
      return { text: `${min} or more goals${from}`, push, half };
    }
    // under
    const lo = Math.min(...legs);
    const max = Math.ceil(lo) - 1; // largest integer total < the nearer leg
    const push = whole
      ? `exactly ${N} goal${N === 1 ? "" : "s"}${from} — stake back`
      : undefined;
    // under half: total === intLeg. Lower int leg (N=k.25) → half-win; upper (N=k.75) → half-loss.
    const half =
      quarter && intLeg !== undefined
        ? `exactly ${intLeg} goal${intLeg === 1 ? "" : "s"}${from} — ${intLeg === Math.min(...legs) ? "half win" : "half loss"}`
        : undefined;
    return {
      text: max <= 0 ? `no goals${from}` : `${max} or fewer goals${from}`,
      push,
      half,
    };
  }

  // Asian handicap.
  const pushAh =
    whole && N >= 1
      ? `${favName} ${live ? `outscores ${dogName}` : "wins"} by exactly ${N}${from} — stake back`
      : whole && N === 0
        ? `a draw${from} — stake back`
        : undefined;

  if (side === "fav") {
    const hi = Math.max(...legs);
    const by = Math.floor(hi) + 1; // smallest integer margin clearing the farther leg
    const verb = live ? `outscores ${dogName}` : "wins";
    const text =
      by <= 1
        ? `${favName} ${verb}${from}`
        : `${favName} ${verb} by ${by}+${from}`;
    // fav half: margin === intLeg. Upper int leg (N=k.75) → half-win; lower (N=k.25, incl 0) → half-loss.
    let half: string | undefined;
    if (quarter && intLeg !== undefined) {
      const kind = intLeg === Math.max(...legs) ? "half win" : "half loss";
      half =
        intLeg === 0
          ? `a draw${from} — ${kind}`
          : `${favName} ${verb} by exactly ${intLeg}${from} — ${kind}`;
    }
    return { text, push: pushAh, half };
  }

  // dog: wins when margin < N.
  const lo = Math.min(...legs);
  const maxMargin = Math.ceil(lo) - 1; // largest integer margin strictly below the nearer leg
  let text: string;
  if (maxMargin < 0) {
    text = live ? `${dogName} outscores ${favName}${from}` : `${dogName} wins`;
  } else if (maxMargin === 0) {
    text = live
      ? `${dogName} is not outscored${from}`
      : `${dogName} wins or draws`;
  } else {
    text = live
      ? `${dogName} not outscored by ${maxMargin + 1}+${from}`
      : `${dogName} wins, draws, or loses by ${maxMargin}`;
  }
  // dog half: margin === intLeg. Lower int leg (N=k.25) → half-win; upper (N=k.75) → half-loss.
  let half: string | undefined;
  if (quarter && intLeg !== undefined) {
    const kind = intLeg === Math.min(...legs) ? "half win" : "half loss";
    half =
      intLeg === 0
        ? `a draw${from} — ${kind}`
        : `${favName} ${live ? `outscores ${dogName}` : "wins"} by exactly ${intLeg}${from} — ${kind}`;
  }
  return { text, push: pushAh, half };
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
  // Two-sided lines: the bet's own snapshot price (dog/under differ from the
  // line's primary priceC). Falls back to l.priceC for legacy rows.
  priceCOverride?: number | null,
) {
  const pc = priceCOverride ?? l.priceC;
  if (l.market === "ou" || side === "over" || side === "under") {
    const labels = ouLabels ?? { over: "Over", under: "Under" };
    const word = side === "over" ? labels.over : labels.under;
    return `${word} ${ball(l.ballQ)} @ ${priceSigned(pc)}`;
  }
  const fav = l.favSide === "home" ? m.homeTeam : m.awayTeam;
  const dog = l.favSide === "home" ? m.awayTeam : m.homeTeam;
  return side === "fav"
    ? `${fav} −${ball(l.ballQ)} @ ${priceSigned(pc)}`
    : `${dog} +${ball(l.ballQ)} @ ${priceSigned(pc)}`;
}
