# By Day Date Filter — Design

> **Status:** Approved 2026-06-24. Ready for implementation planning.
> **Scope:** Add a secondary `{Previous | Today | Tomorrow}` date filter to the player
> match board's **By Day** view. UI-only — no schema, API, grading, or money changes.
> This is **Cycle 1** of a two-part request; the Wikipedia match-detail page is a
> separate, later design.

## Goal

The board's **By Day** view currently lists every upcoming day's matches under sticky
date headers. Add a secondary 3-chip date filter so a player can quickly switch the
By Day list between **yesterday's**, **today's**, and **tomorrow's** matches. The
**By Group** view is unchanged and remains the way to browse the full fixture list.

## Decisions (from brainstorming)

- **Applies to By Day only.** The chip row shows only when the primary toggle is on
  By Day. By Group renders exactly as today.
- **Strictly three chips:** `Previous | Today | Tomorrow`. Matches 2+ days out are not
  shown in By Day (they remain visible in By Group).
- **`Previous` = yesterday only** (not the full history).
- **Default chip = Today** on every load (component state, not persisted).
- **Trade-off accepted:** By Day no longer browses the full upcoming schedule; By Group
  (unchanged) covers that.

## Control & state

In `src/app/(player)/page.tsx`, `MatchesPage` gains:

```ts
type DateBucket = "previous" | "today" | "tomorrow";
const [dateBucket, setDateBucket] = useState<DateBucket>("today");
```

Render a 3-segment chip row **only when `view === "day"`**, placed directly under the
existing `{By Day | By Group}` toggle (and above/below the existing practice link —
implementer's call, keep it visually grouped with the toggle). Style it to match the
existing toggle: a rounded `bg-surface-2` container with three equal segments; the
active segment uses `bg-surface text-ink shadow-sm`, inactive use `text-faint`
(mirroring the existing `TabButton` styling). Labels: `t.previous`, `t.today`,
`t.tomorrow`.

The existing `TabButton` is built for the 2-tab primary toggle. The date chips are a
separate 3-segment control — the implementer may either generalize a small shared chip
or add a sibling component; do not break the existing `{By Day | By Group}` toggle.

## Filtering

Compute the target MMT date from the bucket and pass it to `ByDay`:

```ts
const targetDay =
  dateBucket === "previous"
    ? yesterdayMmt()
    : dateBucket === "tomorrow"
      ? tomorrowMmt()
      : todayMmt();
```

`ByDay` receives `targetDay` as a prop and filters before its existing grouping:

```ts
const board = matches.filter((m) => m.matchDay === targetDay);
```

(`matchDay` is a `YYYY-MM-DD` MMT string on each match row, matching the format
`todayMmt()` / `tomorrowMmt()` / `yesterdayMmt()` produce.) The rest of `ByDay` — the
`dayGroups` map, sticky date headers, and `<MatchCard>` rendering — is unchanged.
Because each bucket is exactly one calendar day, `dayGroups` collapses to a single
dated section; the sticky header still shows the friendly date via `dayLabel`.

`ByDay` no longer needs to filter out finished matches (it already doesn't, after the
prior uniform-card change): yesterday's matches render as `COMPLETED` cards, today's as
a mix, tomorrow's as scheduled.

## New helper (pure, TDD'd)

Add to `src/lib/client/format.ts`, mirroring `tomorrowMmt()`:

```ts
/** Yesterday's date in MMT, formatted YYYY-MM-DD. */
export function yesterdayMmt(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Yangon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(Date.now() - 86400000));
}
```

## Empty bucket

When the selected bucket has no matches (e.g. a rest day), `ByDay` shows a clear
**"No matches"** message using a new key `t.noMatchesDay`, instead of the current
`t.noBets` ("No bets yet"), which is about bets rather than fixtures. (The `noBets`
usage elsewhere is unchanged; only the By Day empty state switches to `noMatchesDay`.)

## i18n

Add to **both** `src/lib/i18n/en.ts` and `src/lib/i18n/mm.ts` (parity test enforces):

- `previous` — EN `"Previous"`, MM Burmese machine-draft.
- `noMatchesDay` — EN `"No matches"`, MM Burmese machine-draft.

`today` (`"Today"`) and `tomorrow` (`"Tomorrow"`) already exist and are reused for the
chip labels.

## Edge cases

- **Empty bucket** → "No matches" message (above); chips still switch buckets.
- **Default Today with no matches today** → empty message shows; player can tap
  Previous/Tomorrow. Acceptable.
- **Switching to By Group** → the date chip row is hidden; By Group ignores the bucket
  entirely and shows all fixtures as today.
- **Bucket state persists across SSE reloads** (`reload()` only refreshes `matches`;
  `dateBucket` is independent React state, so the selected chip is retained).

## Testing

- **Unit (`yesterdayMmt`)** in `src/lib/client/format.test.ts`: assert it equals the
  day before `todayMmt()` — e.g. parse both as dates and assert a one-day difference,
  and assert the `YYYY-MM-DD` shape. Deterministic without mocking the clock by
  comparing the two helpers' outputs.
- **i18n parity test** auto-covers `previous` and `noMatchesDay`.
- **Manual**: `npm run build` + lint clean; eyeball on staging — chips switch the By Day
  list between yesterday/today/tomorrow; an empty bucket shows "No matches"; By Group is
  unaffected; the chip row is hidden in By Group.

## Out of scope

- The Wikipedia match-detail page (Cycle 2, separate spec).
- Any change to By Group, the match-card itself, grading, settlement, schema, or APIs.
- Persisting the selected bucket across sessions.
- A "Later"/4th bucket for matches beyond tomorrow (explicitly excluded by the
  strictly-3 decision).
