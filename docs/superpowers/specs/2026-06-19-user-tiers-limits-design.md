# Design — User Tiers & Per-User Bet Limits (Feature A)

> **Status:** Approved in brainstorming 2026-06-19.
> **Scope:** Feature A of two. Feature B (onboarding: PWA-install + language gate) is a
> separate spec/plan, queued next.
> **Touches the money core** (`placeBet`) — change only alongside its tests.

## Context

Today every player shares the same house limits (per-match carve-out + daily pool in
`src/lib/bets/place.ts`) and the global MIN/MAX stake. The owner wants **per-user tiers**
so casual players are capped while trusted ("pro") players are not, plus admin visibility
into live exposure.

## Decisions (locked)

- **Two tiers:** `standard` (default) and `pro`.
- **Standard caps (all configurable in admin Settings; defaults shown):**
  - per-bet max **500,000** MMK (`stdMaxStakeMmk`)
  - **outstanding** cap **1,000,000** MMK (`stdOutstandingMmk`) — outstanding = sum of the
    player's **pending** (undecided) bet stakes; a new bet is rejected if it would push the
    total over the cap. Clears as matches settle.
  - **max bets per match 2** (`stdMaxBetsPerMatch`) — count of the player's non-void bets on
    one match.
- **Pro:** skips ALL tier caps.
- **House limits (daily pool + per-match carve-out + global MIN/MAX) apply to EVERYONE**,
  standard and pro alike. Tier caps stack on top; the tightest applicable limit wins.
- **Tier assignment:** admin sets a player's tier (default standard) on the admin Players
  page. Standard caps are editable in admin Settings (not hardcoded).
- **`recordBet` (admin manual recording) bypasses tier caps** (it already bypasses the
  house/started/day gates — admin override).
- **Admin dashboard** surfaces: house outstanding exposure, daily-pool usage, tier
  breakdown, and a top-exposures watchlist.

## Data model

- `players.tier`: `text enum ['standard','pro'] not null default 'standard'`.
- `settings` new columns (bigint/int, non-null with defaults):
  - `std_max_stake_mmk` bigint default 500000
  - `std_outstanding_mmk` bigint default 1000000
  - `std_max_bets_per_match` integer default 2
- Drizzle migration `0005_user_tiers.sql` (generate via drizzle-kit; columns have defaults so
  existing rows backfill automatically — no data migration needed).

## Enforcement — `src/lib/bets/place.ts` `placeBet`

After the existing match/line/started/day checks and the house limit block, and ONLY when the
placing player's `tier === 'standard'`, add (inside the same transaction, after locking):

1. **Per-bet:** `if (input.stakeMmk > cfg.stdMaxStakeMmk) throw err(…, 400, "tier_bet_limit")`.
2. **Outstanding:** sum the player's pending stake —
   `select coalesce(sum(stake_mmk),0) from bets where player_id = ? and status = 'pending'` —
   `if (pending + input.stakeMmk > cfg.stdOutstandingMmk) throw err(…, 409, "tier_outstanding_limit", { remainingMmk })`.
3. **Bets per match:** count the player's non-void bets on this match —
   `if (count >= cfg.stdMaxBetsPerMatch) throw err(…, 409, "tier_match_bets")`.

Notes:

- Fetch the player's `tier` and the `settings` caps inside the transaction (settings row id=1
  already loaded for the daily-pool check — reuse that read; add the player tier lookup).
- These checks run AFTER the house daily-pool/carve-out checks so house limits still bind first
  where tighter. (Order doesn't change correctness; pick house-first for message precedence.)
- `pro` players skip steps 1–3 entirely.
- `recordBet` is unchanged (no tier checks).

## Error messages

New codes mapped in `src/lib/client/errMsg.ts` → new i18n keys (EN + MM, parity test):

- `tier_bet_limit` → `errTierBetLimit`: "Max {n} MMK per bet for your account" (use the cap).
- `tier_outstanding_limit` → `errTierOutstanding`: "You can have only {n} MMK in open bets" (remaining/headroom).
- `tier_match_bets` → `errTierMatchBets`: "Max {n} bets per match for your account".
  Reuse the existing `errLimit`-style `{n}` substitution pattern in `errMsg`.

## UI

- **Admin Players** (`src/app/admin/players/page.tsx` + `/api/admin/players`): show each player's
  tier badge; add a Standard⇄Pro toggle (new `action: "set_tier"` on the players route → updates
  `players.tier`; audit-logged). Players list query returns `tier`.
- **Admin Settings** (`src/app/admin/settings/page.tsx` + `/api/admin/settings`): add inputs for
  the 3 standard caps; validate non-negative integers; persist to `settings`.
- **Admin Overview dashboard** (`src/app/admin/page.tsx` + `/api/admin/dashboard`): add four
  widgets, computed server-side:
  1. **House outstanding exposure** — `sum(stake_mmk) where status='pending'` (all-time pending),
     and today's pending stake.
  2. **Daily-pool usage** — today's non-carve-out pending+placed stake vs `dailyTotalLimitMmk`
     (used / remaining), mirroring the pool math in `place.ts`.
  3. **Tier breakdown** — counts of standard vs pro players; how many standard players are at/near
     (≥80%) their outstanding cap.
  4. **Top exposures** — top 5 players by current pending stake (name + amount).
- **Player bet page** (`bet/[matchId]`): on a tier rejection, `errMsg` already surfaces the
  message via the existing error path — no special UI, just the new strings.

## Out of scope

- Feature B (onboarding). Changing house-limit semantics. Per-tier min stake (kept at global 10,000).

## Constraints

- Postgres/Drizzle (pg-core); Tailwind v4 dark tokens for any admin UI. Bilingual EN/MM (parity
  test). Money core: keep `grade.ts` untouched; add tests for every new rejection + Pro/recordBet
  bypass. lint + full test suite + build green. Deploy: dev → push main → prod folder
  `git pull && npm run build` → restart `worldbet worldbet-staging`. Work on `feature/user-tiers`.

## Verification

1. Tests: standard per-bet over cap rejected; outstanding cap rejected at boundary (and headroom
   message); 3rd bet on a match rejected; pro bypasses all three; recordBet bypasses; house
   daily-pool still rejects a pro when the pool is exhausted.
2. Migration applies; existing players default to `standard`; settings caps default correctly.
3. Admin: promote a player to pro (limits lift); edit a cap in Settings (takes effect); dashboard
   shows the four widgets with correct numbers against seeded bets.
4. lint + `npm test` + build green; EN/MM parity passes.
