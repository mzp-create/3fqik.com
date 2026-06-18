# Spec: Malay signed-price grading model (replaces A3)

**Date:** 2026-06-18 · **Status:** Draft for owner review

## Context

The owner records lines in Malay shorthand (e.g. `spain 3+35 4+75` = Spain −3 @
+0.35 handicap, Over 4 @ +0.75 goals) and wants the system to **store and grade
signed Malay prices**, replacing the current "A3 even-money / on-the-line
payout" model. This is the most money-critical change in the app: it rewrites
the grading engine and re-grades existing bets. Decisions below are confirmed
with the owner.

## The model

A line is **one-directional**: the admin posts a single offered side at a signed
price; players back only that side.

- **AH**: favourite −N goals (N a whole number), offered side = `fav` or `dog`.
- **O/U**: total N goals, offered side = `over` or `under`.
- **Price** `p` is signed, −1.00…+1.00 (stored `priceC` −100…+100, excludes 0).

### Outcome (whole-number lines only; effective = after-bet goals, as today)

Let `margin = effFav − effDog` (AH) and `total = effFav + effDog` (O/U).

| Offered side | WIN when   | PUSH when  | LOSE when  |
| ------------ | ---------- | ---------- | ---------- |
| AH `fav`     | margin > N | margin = N | margin < N |
| AH `dog`     | margin < N | margin = N | margin > N |
| O/U `over`   | total > N  | total = N  | total < N  |
| O/U `under`  | total < N  | total = N  | total > N  |

### Payout (stake S, signed price p)

| Result | p > 0        | p < 0        |
| ------ | ------------ | ------------ | --- | --- |
| WIN    | `+p·S`       | `+S`         |
| LOSE   | `−S`         | `−           | p   | ·S` |
| PUSH   | `0` (refund) | `0` (refund) |

Rounded half-away-from-zero, once, as today. **No quarter-line splitting** (owner
uses whole numbers only; `.5` lines simply never push).

### Worked examples (from the owner's shorthand)

- `spain 3+35` (AH Spain −3 @ +0.35, offered fav): Spain by 4 → **+0.35·S**;
  by exactly 3 → **push**; by 2 (or loses) → **−S**.
- `spain 4+75` (O/U Over 4 @ +0.75): 5 goals → **+0.75·S**; 4 → **push**; 3 → **−S**.
- `belgium 2-90` (O/U Over 2 @ −0.90): 3 goals → **+S**; 2 → **push**; 1 → **−0.90·S**.

## Encoding & schema

- `lines.priceC`: now **signed** −100…100 (exclude 0). No column type change
  (already integer); loosen validation (currently positive-only).
- `lines.offeredSide` (**new column**, text enum `fav|dog|over|under`): which side
  is bettable. Migration adds it; backfill existing rows (`ah`→`fav`, `ou`→`over`)
  — only affects future placement, not re-grading.
- `lines.ballQ`: keep ×4 encoding; validate whole goals (multiple of 4) for new
  lines. `favSide` unchanged (which team is the favourite, AH only).

## Code changes

1. **`src/lib/engine/grade.ts`** — rewrite to the table above. New `GradeInput`
   keyed on the bet's `side` (must equal the line's offered side), `ballQ`,
   signed `priceC`, `stake`, `effFav`/`effDog`. Returns `{status, netMmk}` and a
   `gradeDetail` with margin/total, result, push flag. **Full new vitest table**
   replacing the A3 table in `grade.test.ts`.
2. **`src/lib/bets/place.ts`** — allow only `side === line.offeredSide`; reject
   others (`side_not_offered`).
3. **Line forms** — `src/components/admin/LineGrid.tsx` and
   `src/app/admin/lines/page.tsx`: signed price input (−1.00…1.00) + an
   offered-side selector; `src/app/api/admin/lines/route.ts` validation
   (`validateLine`) updated for signed price + offeredSide.
4. **Bet slip / board** — `MatchCard.tsx` + `BetSlip.tsx`: show only the offered
   side per market (was fav/dog/over/under).
5. **Displays** — `pickLabel` (`src/lib/client/format.ts`) and every surface
   show the signed price (e.g. `Spain −3 @ +0.35`). Affects ticket, balance,
   settle, reports, admin bets (all already routed through `pickLabel`).
6. **Re-grade + delta report** — extend `scripts/regrade.ts` to re-grade **all**
   bets (drop the `settlementId IS NULL` filter) under Malay, and emit a
   **per-player report of old net vs new net for already-settled bets** (CSV /
   on-screen) so the owner can reconcile cash. Settled bets' net is recomputed;
   the historical `settlements.net_mmk` (what was paid) is preserved, and the
   report surfaces the difference — no silent overwrite of paid balances.
7. **Fees** — commission/discount layer unchanged (still on net at grading).

## Test impact (significant)

The A3 expected values are baked into `grade.test.ts`, `place.test.ts`,
`settleMatch.test.ts`, and the accounting tests. All grading-dependent expected
numbers must be **recomputed for Malay** and updated. New authoritative table in
`grade.test.ts`. This is the bulk of the work and the main risk surface.

## Rollout & verification

- Phased: engine + tests first (pure, no I/O) → placement/slip → line forms →
  displays → re-grade script + delta report.
- Gates: `npm test` green with the rewritten tables; `tsc`/lint/build clean.
- Staging first: re-grade the cloned DB, eyeball the delta report, place/settle a
  few bets end-to-end, THEN run on production (backup first; SQLite + PG backups).
- Keep the A3 grading documented in git history for rollback.

## Risks

- **Settled balances change.** Re-grading paid bets produces deltas; the report
  is the mitigation, but the owner must actually reconcile the cash differences.
- **One-sided lines reduce player options** (no dog/Under unless the admin posts
  that side). Intended.
- **Large test rewrite** — every A3 expected value changes; high churn, must be
  done carefully or settlement math silently breaks.

## Out of scope

Quarter/half-line splitting; per-side dual pricing with margin; standings.
