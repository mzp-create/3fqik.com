# Final Score on Bets — Design

> **Status:** Approved 2026-06-24. Ready for implementation planning.
> **Scope:** Surface each match's **final score** on every settled bet in the player
> **My Bets** and **Balance** views (and the downloadable ticket PNG), so a player can
> cross-reference the line, pick, outcome, and net against the real result and judge
> whether the grading/payout is correct. Display-only — no change to grading,
> settlement, money math, or the data model.

## Goal

A player looking at My Bets / Balance currently sees the line/handicap, their pick and
price, the outcome status (won/lost/push/…), and the net payout — but **not the final
match score**. Without the score they can't verify the computation. The match's final
score columns (`matches.home_score` / `matches.away_score`) already exist and are
populated at settlement; they are simply not selected into the bet/balance queries.
This change selects them and renders a compact `FT 2–1` line on each settled bet.

## Decisions (from brainstorming)

- **Final score only.** Show `FT 2–1`. Do **not** also surface score-at-bet in these
  lists (it already appears in the ticket detail as "Score at bet" for live bets).
- **Finished matches only.** Scheduled / live / still-pending bets show **no** score
  line. No in-play (LIVE) score in these views.
- **Include it in the ticket PNG.** The downloadable/printable "Save ticket" image gains
  a `Final score` row.
- **No client-side expected-outcome computation.** Re-running the grading engine on the
  client would always agree with the server (same engine) and would duplicate money
  logic — useless for auditing and against the practice-mode isolation spirit. Show the
  raw inputs (final score) and let the human check the math.

## Data layer

The final score must reach both views. Two query changes:

### 1. `/api/bets` GET — `src/app/api/bets/route.ts`

In the `.select({ … match: { … } })` block (currently selects
`homeTeam, awayTeam, stage, status`), add the two score columns to the nested `match`
object:

```ts
match: {
  homeTeam: schema.matches.homeTeam,
  awayTeam: schema.matches.awayTeam,
  stage: schema.matches.stage,
  status: schema.matches.status,
  homeScore: schema.matches.homeScore,
  awayScore: schema.matches.awayScore,
},
```

The matches table is already inner-joined, so no new join. Each returned ticket gains
`match.homeScore` / `match.awayScore` (`number | null`).

### 2. `playerDayItems` — `src/lib/accounting/queries.ts`

This is the source of Balance `items[]`. Its rows are **flat** (e.g. `homeTeam`,
`awayTeam`, bet `status`), and it **already selects the final scores** as
`finalHomeScore: schema.matches.homeScore` and `finalAwayScore: schema.matches.awayScore`
(the matches table is already inner-joined). So the scores need **no** query change.

The only missing field is the **match** status, needed to gate on "finished only" (the
flat `status` field here is the **bet** status, e.g. won/pending). Add exactly one field:

```ts
matchStatus: schema.matches.status,
```

So after this change `playerDayItems` rows carry `finalHomeScore`, `finalAwayScore`
(pre-existing) and `matchStatus` (new). Why gate on match status rather than reuse the
existing scores alone: `playerDayItems` excludes only `void` bets, so a still-`pending`
bet on a **live** match would carry a non-null in-play score — gating on
`matchStatus === "finished"` keeps the "finished only" decision correct.

## Pure helper (single source of truth, TDD'd)

Add to `src/lib/client/format.ts` (where display/pure helpers live):

```ts
/** "2–1" only when the match is finished and both scores are present; else null.
 *  Caller-agnostic: pass the match status plus the two scores from whichever shape
 *  the caller has (nested match.* for bets, flat matchStatus/homeScore for balance). */
export function finalScore(
  status: string | undefined,
  homeScore: number | null | undefined,
  awayScore: number | null | undefined,
): string | null {
  if (status !== "finished" || homeScore == null || awayScore == null)
    return null;
  return `${homeScore}–${awayScore}`;
}
```

The en-dash `–` (U+2013) matches the separator already used for scores elsewhere
(e.g. `scoreHomeAtBet–scoreAwayAtBet` in `TicketCard`, the match-card score).

## Rendering

Every call site shows the line **only when `finalScore(...)` returns non-null** — so
scheduled/live/pending bets render nothing extra and the layout is unchanged for them.

### My Bets list — `src/app/(player)/bets/page.tsx`

Under the existing pick line, add a compact score line using the existing `t.finished`
("FT") label:

```tsx
{
  finalScore(b.match.status, b.match.homeScore, b.match.awayScore) && (
    <div className="text-base text-faint">
      {t.finished}{" "}
      {finalScore(b.match.status, b.match.homeScore, b.match.awayScore)}
    </div>
  );
}
```

(Compute once into a const to avoid calling twice.)

### Ticket detail + PNG — `src/components/TicketCard.tsx`

- Extend the `TicketRow["match"]` type with `homeScore?: number | null` and
  `awayScore?: number | null`.
- In the on-screen detail layout **and** the `rows: [string, string][]` array that the
  canvas/PNG builds, add a labeled row when a final score exists, placed adjacent to the
  existing "Score at bet" (`t.scoreAtBet`) row:

```ts
const ft = finalScore(b.match.status, b.match.homeScore, b.match.awayScore);
// …
if (ft) rows.push([t.finalScore, ft]);
```

- The canvas height is computed from the number of rows; bump the height math so the
  extra `Final score` row is not clipped (follow the existing `canvasHeight` pattern —
  add one row's worth, ~36px, when `ft` is present).

### Balance item rows — `src/app/(player)/balance/page.tsx`

- Extend the `BalanceItem` type with `finalHomeScore: number | null`,
  `finalAwayScore: number | null`, `matchStatus: "scheduled" | "live" | "finished"`
  (the scores reuse the names `playerDayItems` already returns).
- Under the pick line, add the same compact `FT 2–1` line, using `item.matchStatus`:

```tsx
{
  finalScore(item.matchStatus, item.finalHomeScore, item.finalAwayScore) && (
    <div className="text-sm text-faint">
      {t.finished}{" "}
      {finalScore(item.matchStatus, item.finalHomeScore, item.finalAwayScore)}
    </div>
  );
}
```

## i18n

Add one key to **both** `src/lib/i18n/en.ts` and `src/lib/i18n/mm.ts` (parity test
enforces identical key sets):

- `finalScore` — EN `"Final score"`, MM Burmese machine-draft (per the `mm.ts`
  convention).

The compact list/balance lines reuse the existing `finished` key (`"FT"`); no new key
needed for those.

## Edge cases

- **Pending bet on an unfinished match** → `finalScore` returns null → no score line
  (unchanged layout).
- **Void bet on a finished match** → score line still shows (harmless and arguably
  useful context); no special handling.
- **Live match with a non-null current score** → `status !== "finished"` → null → no
  line (decision: finished-only).
- **Null score on a "finished" match** (data anomaly) → returns null → no line, no crash.

## Testing

- **Unit (`finalScore`)** in a **new** `src/lib/client/format.test.ts` (no test file
  exists for `format.ts` yet): `("finished", 2, 1) → "2–1"`; `("live", 1, 0) → null`;
  `("finished", null, 1) → null`; `("scheduled", null, null) → null`;
  `(undefined, 2, 1) → null`.
- **i18n parity test** auto-covers the new `finalScore` key.
- **Manual**: `npm run build` + lint clean; eyeball My Bets (list + ticket detail + saved
  PNG) and Balance on staging for a finished bet (score shows) and a pending bet (no
  score). No component-render harness exists, so no new render test is added.

## Out of scope

- Grading, settlement, `placeBet`/`recordBet`, house pool, tier caps, schema — untouched.
- Live (in-play) score display in these views.
- Any client-side recomputation of the expected outcome.
- Admin-side bet views (this change is player-facing only).
