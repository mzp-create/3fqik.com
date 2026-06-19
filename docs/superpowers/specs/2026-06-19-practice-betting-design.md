# Design — Practice / Try-Out Betting (Feature C)

> **Status:** Autonomous design 2026-06-19 (user delegated C with no further input).
> **Hard requirement:** FULLY ISOLATED from real money — practice must never create real
> bets, touch balances, or appear in admin/settlement/dashboard.

## Context & goal

New users should be able to **try placing bets to learn the system** without risk. The real
flow is: board (`MatchCard`) → bet page (pick side, stake, "you win if", payout) → ticket →
later graded by `grade.ts`.

## Decision: client-only sandbox (safest isolation)

Practice is **100% client-side**. It reuses **read-only** real data (the `/api/matches` list +
lines) and the **pure** grading engine (`gradeBet` from `src/lib/engine/grade.ts` — no DB), but:

- **never calls `/api/bets`** (the real placement path) — so it cannot create real bets or hit
  the tier/house limits or settlement;
- holds a **demo balance + demo bets in `localStorage`** only (nothing in Postgres);
- simulates match results client-side (random plausible scoreline → `gradeBet`) so the user sees
  the full place→result→win/loss loop instantly.

This guarantees zero leakage into real money/grading/settlement (the opposite of what the new
guardrails protect), and needs no schema/API change.

## Components

- **`src/lib/client/practice.ts`** — a small `localStorage`-backed store + `usePractice()` hook:
  `{ balanceMmk, bets: DemoBet[] }`, with `START_BALANCE = 1_000_000` (demo MMK), and actions
  `placeDemo(bet)`, `simulate(betId)` (random final score → `gradeBet` → set status/net + adjust
  balance), `reset()`. `DemoBet` carries match teams, market/side, ballQ, priceC, stake, favSide,
  status ('pending'|'won'|'lost'|'push'), netMmk, a simulated score, and an id/timestamp.
- **`src/app/(player)/practice/page.tsx`** — practice board: a prominent **PRACTICE — no real money**
  banner + demo balance, then the real matches via the existing `MatchCard` (read-only data) with an
  `onPick` that routes to `/practice/bet/[matchId]` (MatchCard never calls the API itself — safe to
  reuse; its started-match gating stays, mirroring the real UX).
- **`src/app/(player)/practice/bet/[matchId]/page.tsx`** — self-contained practice bet page mirroring
  the real one (outcome picker, stake + chips, `winNeed` "you win if", `preview` payout, 2-tap
  confirm) but **confirm calls `placeDemo` (localStorage) — NO `/api/bets`**, deducts the demo
  balance, then routes to the practice tickets view. Reuses pure helpers (`priceSigned`, `ball`,
  `teamLabel`, `winNeed`) only.
- **`src/app/(player)/practice/bets` view** (a section on the practice page, or `/practice/tickets`)
  — lists demo bets with the win condition; each pending bet has a **"Simulate result"** button →
  `simulate()` shows won/lost/push + the net, updating the demo balance. A **Reset practice** button.
- **Entry points:** a **"Try practice betting"** item in the hamburger drawer (`MenuDrawer`), and a
  small "New here? Try a practice bet →" link on the real match board. An **"Exit practice"** back
  link returns to the real app. Every practice screen carries the PRACTICE banner so it's never
  confused with real betting.
- **i18n** keys (en/mm): `practiceTitle`, `practiceBanner`, `practiceBalance`, `practiceTry`,
  `practiceSimulate`, `practiceReset`, `practiceExit`, `practicePlaced`, `practiceResultWon`,
  `practiceResultLost`, `practiceResultPush`, `practiceNote`.

## Isolation guarantees (verification targets)

- `grep` shows the practice routes/components never import the real placement API (`/api/bets`,
  `placeBet`) — only `gradeBet` (pure), display helpers, and `/api/matches` (read-only).
- Demo bets exist only in `localStorage` (`practiceState`), never in Postgres; admin bets/settlement/
  dashboard are unchanged and show nothing from practice.
- Clearing `localStorage` resets practice with no server effect.

## Out of scope

- Server-side demo accounts, leaderboards, persisting practice across devices. A guided tooltip tour
  (the sandbox itself is the tutorial). Pre-login practice (kept behind auth, in the `(player)` group).

## Constraints

- Tailwind v4 dark tokens; brand/PRACTICE banner unmistakable. EN/MM parity. `useEffect`-only access
  to `localStorage` (SSR-safe; hook returns a stable initial then hydrates). No money/grading/schema/
  API changes (grade.ts imported read-only). lint + test + build green. Deploy: dev→main→prod folder
  `git pull && npm run build` + restart (no migration). Branch `feature/practice-betting`.

## Verification

1. Open `/practice` (from drawer): PRACTICE banner + 1,000,000 demo balance; real matches show.
2. Place a practice bet → demo balance drops by the stake; demo ticket appears with "you win if".
3. "Simulate result" → shows won/lost/push and adjusts the demo balance using `gradeBet` math.
4. Reset → balance back to 1,000,000, demo bets cleared.
5. Confirm NO real bet was created (admin Bets list unchanged; DB `bets` count unchanged).
6. lint + full test suite + build green; EN/MM parity passes.
