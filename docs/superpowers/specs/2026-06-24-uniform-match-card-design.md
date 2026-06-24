# Uniform Player Match Card — Design

> **Status:** Approved 2026-06-24. Ready for implementation planning.
> **Scope:** Player **By Day** board only. Visual/structural restyle of the match
> card — no changes to money math, grading, bet flow, server gates, or data model
> (one exception: finished matches stop being filtered out of the day board).

## Goal

Give every match on the player day board the **same card skeleton** regardless of
status. Today scheduled cards are tall (bet tiles) while started/finished cards are
short (a one-line notice), and finished matches are hidden from the board entirely.
The result reads as inconsistent and weak. The new card is a uniform, sportsbook-style
vertical layout with a colored status header, circular flag images, score, schedule,
and a betting/status action area.

## Decisions (from brainstorming)

- **Finished matches appear in the day board** as `COMPLETED` cards (stop filtering
  `status === "finished"` out of `ByDay`). By-Group results view is unchanged.
- **Row 6 "betting not yet open"** uses a static message referencing the real kickoff
  time. No new schema field for a betting-open time.
- **Flags are real square SVG images** clipped to a circle (not emoji), bundled offline.
- **Scope is the By-Day board only.** `MatchCard` is rebuilt; the By-Group `ResultRow`
  and the emoji `flag()` helper are left as-is.
- **"Same card size" = balanced, not forced-equal.** Rows 1–5 are fixed height for all
  statuses; row 6 has a `min-height` so message states match the visual weight of bet
  tiles. A scheduled card with AH tiles + OU is allowed to be slightly taller.

## Card anatomy (uniform skeleton for every status)

```
┌──────────────────────────────────┐
│ ● LIVE                  GROUP A   │  1. status chip (colored) + stage
│   Mexico (MEX)   vs  S.Africa(RSA)│  2. names + short codes, symmetric
│      (flag circle) (flag circle)  │  3. circular flag images
│            2  –  1                │  4. score (Anton) / "vs" if scheduled
│        Wed 24 Jun · 21:00         │  5. kickoff (Asia/Yangon)
│ [ bet tiles  /  status message ] │  6. action area (min-height)
└──────────────────────────────────┘
```

### Row 1 — Status chip + stage

- Left: a colored status chip. Colors **differ by status**:
  - `scheduled` → `SCHEDULED`, neutral chip (`bg-surface-2` / `text-muted`).
  - `live` → `● LIVE`, red chip with the existing `.live-dot` pulse (current style).
  - `finished` → `COMPLETED`, settled gray-green chip (muted, low-energy).
- Right: the stage label (e.g. `GROUP A`), small, uppercase, `text-faint`.

### Row 2 — Team names + short codes

- Two symmetric columns: home on the left, away on the right, with a `vs` divider.
- Each side shows the full name with its code, e.g. **Mexico (MEX)**. Name bold
  (`text-ink`), code muted. Truncate long names; never wrap the row.
- Uses existing `teamName(code)` / `teamLabel(code)` from `flags.ts`.

### Row 3 — Circular flag images

- Home flag circle under the home column, away flag circle under the away column.
- Rendered by a new `<FlagCircle code size>` component: an `<img src={flagSrc(code)}>`
  inside a `rounded-full overflow-hidden ring-1 ring-border` frame, `object-cover`.
- Bracket placeholders (e.g. `W73`, `2A`) have no flag → `flagSrc` returns `null` →
  `FlagCircle` renders a neutral placeholder circle showing the raw code.

### Row 4 — Score

- Centered, Anton display font, large.
- `live` → `{home} – {away}` in red (`text-ca`).
- `finished` → `{home} – {away}` in `text-ink`.
- `scheduled` → muted `vs` (no score exists yet); keeps the row height constant.

### Row 5 — Schedule

- Centered kickoff in `Asia/Yangon`, e.g. `Wed 24 Jun · 21:00` (24h). Always shown,
  every status (gives finished/live cards a consistent fifth row).

### Row 6 — Action area (betting or status), `min-height` for balance

State-driven content:

| Status / line state                    | Row 6 content                                |
| -------------------------------------- | -------------------------------------------- |
| scheduled + open AH line               | existing AH tiles (fav/dog) + collapsible OU |
| scheduled + AH suspended               | existing `⏸ Suspended` note                  |
| scheduled + no line / all lines closed | **`Lines coming soon · kicks off 21:00`**    |
| live                                   | `Betting closed — in play`                   |
| finished                               | `Match finished`                             |

- Betting behavior is **unchanged**: same `onPick(market, side)`, same two-sided
  price snapshot, same OU toggle. The tiles simply live inside row 6 now.
- The `matchStarted(m)` gate still governs whether tiles can show (mirrors the server
  guard). Live/finished never show tiles.

## Files & changes

**`src/components/MatchCard.tsx`** — rebuilt around the 6-row skeleton. Keeps the
`MatchRow` / `LineRow` types, `onPick`, the AH-tile markup, and the OU collapsible.
Adds the status chip, symmetric name/flag/score/schedule rows, and the row-6 state
machine. New `<FlagCircle>` presentational component (same file or a sibling).

**`src/app/(player)/page.tsx`** — in `ByDay`, stop filtering finished matches:
`board = matches` (sorted/grouped by `matchDay` as today). Finished cards render via
the same `MatchCard`. Day grouping/sticky headers unchanged.

**`src/lib/client/flags.ts`** — add `flagSrc(code): string | null`:

- reuse `FIFA_TO_ISO2` → `/flags/<iso2>.svg` (lowercase).
- `ENG` → `/flags/gb-eng.svg`, `SCO` → `/flags/gb-sct.svg`.
- unknown/placeholder code → `null`.
  The emoji `flag()`, `teamName()`, `teamLabel()`, and reverse-lookup helpers are
  untouched.

**`scripts/copy-flags.ts`** (new) — copies the ~48 needed square SVGs from
`node_modules/flag-icons/flags/1x1/<iso2>.svg` (plus `gb-eng.svg`, `gb-sct.svg`) into
`public/flags/`. Run once; the SVGs are committed so the PWA has no runtime dependency
on the package.

**`package.json`** — add `flag-icons` as a **devDependency** (source of the SVGs only).

**`src/lib/i18n/en.ts` + `src/lib/i18n/mm.ts`** — add keys (parity test enforces both):
`statusScheduled`, `statusCompleted`, `linesSoon`, `kicksOff`, `bettingClosedLive`,
`matchFinishedNote`. (`live` already exists.) Burmese strings are machine-draft per the
existing `mm.ts` convention.

**`public/flags/*.svg`** (new, ~48 files) — committed flag assets.

## Edge cases

- **Placeholder teams** (knockout fixtures before the bracket resolves, e.g. `W73`):
  name row shows the bare code, `FlagCircle` shows the neutral placeholder. No flag,
  no crash.
- **No line at all** on a scheduled match → row 6 shows the "Lines coming soon" message
  with the formatted kickoff, not an empty/`—` card.
- **Live with null score** (`homeScore == null`) → treat as `0`, consistent with the
  current board's `?? 0`.
- **OU present but AH closed** → row 6 still offers the OU collapsible (mirrors current
  logic where `ou` can render even when `l` is closed).
- **Long country names** (e.g. "Bosnia & Herzegovina") → truncate within the column;
  the code stays visible.

## Testing

- **Unit (`flagSrc`)**: `MEX` → `/flags/mx.svg`, `ENG` → `/flags/gb-eng.svg`,
  `SCO` → `/flags/gb-sct.svg`, placeholder (`W73`) → `null`.
- **i18n parity test** automatically covers the six new keys (en/mm must match).
- **Manual**: build + eyeball all three statuses (scheduled w/ line, scheduled w/o
  line, live, finished) on the staging interface per the deploy convention. No existing
  component-render harness, so no new render test is added.

## Out of scope

- By-Group results view restyle (separate pass).
- Any change to money encoding, grading, `placeBet`/`recordBet`, house pool, or tier
  caps.
- An admin-set "betting opens at" time / countdown (explicitly deferred).
- The broader "Card Mode / Strong Sportsbook Look" full-site redesign
  (`docs/ui-redesign-brief.md`) — this card may inform it but is a standalone change.
