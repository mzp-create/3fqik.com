# Spec: True Malay grading + line-pricing engine

**Date:** 2026-06-26 · **Status:** Approved by owner

## Context

The grading engine (`src/lib/engine/grade.ts`) currently runs a "Malay signed-price"
model introduced in `2026-06-18-malay-pricing-model.md`. Two parts of it are **not**
canonical Malay/Asian-handicap and produce wrong settlement on push/draw and on
favourite/underdog (negative-price) bets:

1. **Negative-price payout is a custom invention.** Today `p < 0` pays `WIN → +S`
   and `LOSE → −|p|·S` (partial loss). Canonical Malay is `WIN → +S·(1/|p|)` and
   `LOSE → −S` (full stake). A loss in Malay is **always** the full stake; only the
   _win_ payout depends on the sign. (Confirmed vs punter2pro, sbo.net.)
2. **Quarter lines never split.** `ballQ` allows quarter goals (`×4` encoding) but
   grading treats every line as a single threshold (`onLine = value === N`), so
   `.25`/`.75` lines never produce half-win / half-loss / half-push. True Asian
   handicap splits the stake 50/50 across the two nearest lines.

The owner wants to **go back to a single, canonical Malay system** and remove all
other custom logic. Data is pre-launch/test: keep the `bets` rows, **wipe all
settlement/balance effects, and re-grade fresh** (Option C) after the core logic is
verified.

This is the most money-critical change in the app. The positive-price branch is
already correct and is unchanged.

## The model

### Per-bet payout (signed price `p` = `priceC`, magnitude 1–100; stake `S`)

| Result | `p > 0`       | `p < 0`           |
| ------ | ------------- | ----------------- |
| WIN    | `+ (p/100)·S` | `+ S · 100/\|p\|` |
| LOSE   | `− S`         | `− S`             |
| PUSH   | `0` (refund)  | `0` (refund)      |

The **only** change from today is the `p < 0` row. Both `p = +100` and `p = −100`
mean even money (`+S`). Loss is always the full stake.

### Line geometry and splitting

`N = ballQ / 4` is the line in goals.

- `ballQ % 4 === 0` → **whole** line (`N` integer). One leg. Pushes on exact (`value === N`).
- `ballQ % 2 === 0` and not whole → **half** line (`.5`). One leg. Never pushes.
- `ballQ` odd → **quarter** line (`.25` / `.75`). **Two legs**: split the stake into
  two `S/2` halves placed on the two nearest lines (the half below and the whole/half
  above), each graded independently at the **same price `p`**.

`value` = `effFav − effDog` (AH margin) or `effFav + effDog` (O/U total).
Per leg with line `Nₖ`:

| Offered side | WIN when   | PUSH when  | LOSE when  |
| ------------ | ---------- | ---------- | ---------- |
| AH `fav`     | value > Nₖ | value = Nₖ | value < Nₖ |
| AH `dog`     | value < Nₖ | value = Nₖ | value > Nₖ |
| O/U `over`   | value > Nₖ | value = Nₖ | value < Nₖ |
| O/U `under`  | value < Nₖ | value = Nₖ | value > Nₖ |

(`= Nₖ` only ever happens on a whole leg, so push only arises on whole/quarter lines.)

### Aggregation and rounding

Compute each leg's **raw** net (un-rounded), sum the legs, then round
half-away-from-zero **once**. This avoids double-rounding bias on odd stakes.

`status` (stored in `bets.status`) is derived from the legs:

- any winning leg and no losing leg → `won`
- any losing leg and no winning leg → `lost`
- all legs push → `push`

Adjacent legs (0.5 apart, integer `value`) can never be win+lose simultaneously, so
this is unambiguous. **Half-win** (net > 0, one leg pushed) is stored as `won`;
**half-loss** (net < 0, one leg pushed) is stored as `lost`. The "half" distinction
lives only in `gradeDetail`/displays, not in the `bets.status` enum.

### Worked examples (`S = 100,000`)

- AH fav `−0.75` (`ballQ 3`), win by 1 (`value 1`): legs 0.5 (win) + 1.0 (push) →
  `+(0.75)·S/2 + 0` = `+37,500`. **half-win.**
- AH fav `+0.25` (`ballQ 1`), draw (`value 0`): legs 0 (push) + 0.5 (lose) →
  `0 + (−S/2)` = `−50,000`. **half-loss.**
- AH fav `−0.90` (`ballQ 4`, `N=1`, whole line), win by 2 (`value 2 > 1`) → single
  leg, WIN `p<0` → `+S·(1/0.90)` = `+111,111` (was `+100,000` under the old model).
- AH fav `−0.90`, lose (`value < 1`): `−S` = `−100,000` (was `−90,000`).
- O/U Over `4` `+0.75` (`ballQ 16`), total 5: whole line, single leg, WIN `+0.75·S`
  = `+75,000`; total 4 → push; total 3 → `−S`.

## Encoding & schema

- `lines.priceC` / `lines.priceOppC`: signed integer `[−100,−1] ∪ [1,100]` (exclude 0).
  Two independently-entered signed prices, one per side. Unchanged; no extra
  magnitude guard (owner trusts admin entry).
- `lines.ballQ`: `×4`, integer `0–40` (AH `≥0`, O/U `≥1`). Quarter lines allowed.
- **Drop `lines.offered_side`** (migration `0006`): vestigial since lines went
  two-sided. `manage.ts` stops writing it.

## Code changes

1. **`src/lib/engine/grade.ts`** — rewrite `compute` to: split by `ballQ` parity,
   grade each leg, apply the corrected payout table (negative WIN = `S·100/|p|`,
   LOSE = `−S`), sum + round once. `GradeResult` = `{ status, netMmk }` unchanged.
   `GradeDetail` adds `legs: [{ lineGoals, value, result, net }]` (1–2 entries) and a
   display `result: 'win'|'push'|'lose'|'half-win'|'half-lose'`.
2. **`src/lib/client/gradeBreakdown.ts`** — render half outcomes and the corrected
   negative-win text (`WON +X (S ÷ 0.90)` not "full stake"); read `legs`.
3. **`src/lib/client/format.ts` `winNeed`** — add quarter-line phrasing (half-win and
   partial stake-back notes). Today it assumes only whole lines push.
4. **`src/lib/db/schema.ts` + `drizzle/0006_drop_offered_side.sql`** — drop
   `offered_side`.
5. **`src/lib/lines/manage.ts`** — remove the `offeredSide` insert value.
6. **Displays** — `MatchCard.tsx`, `TicketCard.tsx`, balance/settle/admin boards
   already route through `pickLabel` / `gradeBreakdown`; verify, no new logic.
7. **`src/lib/client/practice.ts`** — no logic change (routes through `gradeBet`);
   isolation invariant preserved (never calls `/api/bets`).
8. **`scripts/regrade.ts`** — wipe + re-grade (Option C), see below.

## Data wipe + re-grade (Option C)

`scripts/regrade.ts` (idempotent, transactional):

1. Delete all `settlements` rows; set `bets.settlement_id = NULL`.
2. Reset every non-void bet → `status='pending'`, `net_mmk=NULL`, `fee_mmk=NULL`,
   `settled_at=NULL`.
3. Reset `match_days` (`settled`/`closed` → recomputed by re-grade).
4. Re-grade every **finished** match using the same logic as
   `settleMatch.gradeMatchTickets` (corrected engine), then re-close/re-settle days
   exactly as the normal flow does.
5. Print a per-player old-vs-new net summary for eyeballing.
6. **Emit a machine-readable dump** (`scripts/out/regrade-bets.json`, gitignored) of
   every bet with its full grade result, for the Excel export below.

Destructive → **backup first; run on staging first, then prod.**

### Excel export of all bets + grade results

After the engine + regrade are done, produce `docs/out/regrade-bets.xlsx` from the
JSON dump (via the xlsx skill). One row per bet, columns:

`ticketNo · player · match (home–away) · final score · market · side · line (ball,
N) · price (signed Malay) · stake · leg breakdown (each leg's line/result/net) ·
old net · new net · Δ · status (won/lost/push, flagged half-win/half-loss)`.

This is the owner's verification artifact for the re-grade — it is the
acceptance gate before running on production.

## Test impact (the bulk of the work)

- **`grade.test.ts`** — full new authoritative table: positive & negative payouts,
  quarter-line half-win/half-loss/half-push, whole-line push, half-line no-push,
  rounding (sum-then-round-once), `±100` boundaries, validation.
- Update expected numbers in `place.test.ts`, `settleMatch.test.ts`, the accounting
  tests (`settle.test.ts`, `dashboard.test.ts`), `winNeed.test.ts`,
  `practice.test.ts`.
- TDD: engine + table first (pure, no I/O), then downstream.

## Rollout & verification

- Phased: engine + tests → `gradeBreakdown` / `winNeed` → schema migration →
  regrade script. Gates: `npm test` green, `tsc`/lint/`npm run build` clean.
- Migrations affect **both** DBs (`worldbet`, `worldbet_staging`): run `db:migrate`
  against each at deploy.
- Staging first: migrate, run regrade on the staging DB, eyeball the old-vs-new
  summary, place/settle a few quarter-line bets end-to-end, THEN prod (backup first).

## Risks

- **Re-grade changes balances** — expected (that's the point); the old-vs-new summary
  is the reconciliation aid. Data is pre-launch test data, lowering the stakes.
- **Negative-price liability rises** — `S·100/|p|` can exceed `S` (e.g. `−0.50` →
  `2·S`). House exposure is measured by _stake_, not payout, so limits are unaffected,
  but net P&L swings more on underdog wins. Intended (canonical Malay).
- **Large test rewrite** — every negative-price and quarter-line expected value
  changes; high churn, must be done carefully or settlement math silently breaks.

## Out of scope

Per-side dual margin pricing, standings, commission/fee model changes (the fee layer
on net is unchanged).
