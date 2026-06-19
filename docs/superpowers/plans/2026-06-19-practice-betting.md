# Practice / Try-Out Betting — Implementation Plan (Feature C)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Use `frontend-design` for UI (dark Dark Stadium). HARD RULE: practice is client-only — NEVER import/call `/api/bets` or `placeBet`. Only `gradeBet` (pure), display helpers, `/api/matches` (read-only), and `localStorage`.

**Goal:** A fully client-side practice sandbox so users learn the bet flow with a demo balance and simulated results, isolated from real money.

**Branch:** `feature/practice-betting`.

---

## Task 1: Practice store + hook (`src/lib/client/practice.ts`)

**Files:** Create `src/lib/client/practice.ts`. Test: `src/lib/client/practice.test.ts`.

- [ ] **Step 1 (TDD):** write `practice.test.ts` for the pure parts (no React/localStorage): a `resolveDemo(bet, homeGoals, awayGoals)` helper that wraps `gradeBet` and returns `{ status, netMmk }`, and `applyResult(balance, bet, result)` returning the new balance (balance + netMmk). Test: a fav bet priceC +92 stake 100k on ballQ 3, score 2-1 (home fav) → won, net +92,000, balance 900,000→992,000. A lost case. A push (ballQ 4, score 1-1) → 0.

```ts
import { it, expect } from "vitest";
import { resolveDemo, applyResult, START_BALANCE } from "./practice";
it("resolveDemo grades a demo bet via the real engine", () => {
  const bet = {
    market: "ah",
    side: "fav",
    ballQ: 3,
    priceC: 92,
    stakeMmk: 100_000,
    favSide: "home",
  } as const;
  const r = resolveDemo(bet, 2, 1);
  expect(r.status).toBe("won");
  expect(r.netMmk).toBe(92_000);
});
it("applyResult adjusts balance by net", () => {
  expect(
    applyResult(900_000, { stakeMmk: 100_000 } as never, {
      status: "won",
      netMmk: 92_000,
    }),
  ).toBe(992_000);
});
it("START_BALANCE is the demo bankroll", () => {
  expect(START_BALANCE).toBe(1_000_000);
});
```

- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** implement `practice.ts`:
  - `export const START_BALANCE = 1_000_000;`
  - `DemoBet` type (`id, ts, homeTeam, awayTeam, matchId, market, side, favSide, ballQ, priceC, stakeMmk, status: "pending"|"won"|"lost"|"push", netMmk: number|null, simHome: number|null, simAway: number|null`).
  - `resolveDemo(bet, home, away)`: compute `effFav`/`effDog` from `favSide` (home→fav=home goals) with `Math.max(.,0)` (pre-match demo: at-bet 0-0, so eff = final), call `gradeBet({ market, side, ballQ, priceC, stake: stakeMmk, effFav, effDog })`, return its `{status, netMmk}`.
  - `applyResult(balance, bet, result)`: `balance + result.netMmk` (stake already deducted at placement; net already accounts for stake on a loss — VERIFY against grade.ts semantics: gradeBet.netMmk is the player's net delta, so on placement DON'T pre-deduct stake; instead deduct stake at placement AND add (stake+netMmk) on win? — see Step 3a).
  - **Step 3a (semantics — get this right):** grade.ts `netMmk` is the player's net result (win: +p·S or +S; lose: −S or −|p|·S; push: 0). So the demo balance flow is: at placement, do NOT change balance (the bet is "open"); when simulated, `balance += netMmk` (net already includes the loss of stake on a loss). So `applyResult(balance, bet, result) = balance + result.netMmk`. Show the open stake separately as "in play". (Simpler + matches real semantics: balance only moves on settle, by net.) Adjust the test accordingly: balance 1,000,000 → win +92,000 → 1,092,000. **Use this model; fix the Step-1 test numbers to match (start 1,000,000; won → 1,092,000).**
  - `usePractice()` React hook (client): reads/writes `localStorage["practiceState"]` `{ balanceMmk, bets }`; SSR-safe (initial state = `{balanceMmk: START_BALANCE, bets: []}`, hydrate from localStorage in `useEffect`); actions `placeDemo(input)` (push a pending DemoBet), `simulate(id)` (pick random `home`/`away` 0–4, `resolveDemo`, set status/net/sim score, `balance += net`), `reset()` (back to START_BALANCE, []). Persist on every change.
- [ ] **Step 4:** run test → PASS. `npm run lint`.
- [ ] **Step 5:** commit `feat(practice): demo store + pure resolve/grade helper`.

## Task 2: i18n keys

**Files:** `src/lib/i18n/en.ts`, `mm.ts`.

- [ ] Add (en + mm parity): `practiceTitle: "Practice"`, `practiceBanner: "PRACTICE — no real money"`, `practiceBalance: "Practice balance"`, `practiceInPlay: "In play"`, `practiceTry: "Try a practice bet"`, `practiceSimulate: "Simulate result"`, `practiceReset: "Reset practice"`, `practiceExit: "Exit practice"`, `practicePlaced: "Practice bet placed"`, `practiceResultWon: "WON (practice)"`, `practiceResultLost: "LOST (practice)"`, `practiceResultPush: "PUSH (practice)"`, `practiceNote: "This is practice mode to learn the app. No real money is involved."` (Burmese values in mm.ts.)
- [ ] parity test + lint. Commit `feat(practice): i18n keys`.

## Task 3: Practice board + bet page + tickets

**Files:** Create `src/app/(player)/practice/page.tsx`, `src/app/(player)/practice/bet/[matchId]/page.tsx`. (Tickets can live as a section on the practice page.)

- [ ] **Practice board** (`practice/page.tsx`, client): fetch `/api/matches` (read-only); a sticky PRACTICE banner (`bg-gold/15 text-gold border border-gold/30`) + demo balance (from `usePractice`) + `practiceExit` link to `/`; render the matches via the existing `MatchCard` with `onPick={(market, side) => router.push(\`/practice/bet/${m.id}?market=${market}&side=${side}\`)}`; below, a "Practice tickets" list of `usePractice().bets`with each bet's`winNeed`text and a`practiceSimulate`button (pending) or its result badge; a`practiceReset`button. Reuse`MatchCard`, `winNeed`, `priceSigned`, `ball`, `teamLabel`, `EmptyState`. DO NOT import the real bet API.
- [ ] **Practice bet page** (`practice/bet/[matchId]/page.tsx`, client): mirror the REAL `bet/[matchId]/page.tsx` UI (outcome picker, stake + CHIPS, `winNeed` "you win if", `preview` payout, 2-tap confirm) — copy its presentation, but in `confirm()` call `usePractice().placeDemo({...})` (NO `/api/bets`) then `router.push("/practice")`. Fetch the match via `/api/matches/[matchId]` (read-only). Keep the started-match guard (`matchStarted`). Wrap in `Suspense` like the real page (uses `useSearchParams`).
- [ ] `npm run build && npm run lint`. Commit `feat(practice): board + bet page + tickets`.

## Task 4: Entry points

**Files:** `src/components/MenuDrawer.tsx`, `src/app/(player)/page.tsx`.

- [ ] Add a drawer item "Try practice betting" → `/practice` (above Logout). Add a small dismissible-free link on the real board (top): `practiceTry` → `/practice`.
- [ ] build + lint. Commit `feat(practice): entry points (drawer + board link)`.

## Task 5: Verify + deploy

- [ ] `npm run lint && npm test && npm run build` green.
- [ ] **Isolation grep:** confirm `src/app/(player)/practice` + `src/lib/client/practice.ts` contain NO `/api/bets`, no `placeBet`/`recordBet` import. `grep -rn "api/bets\|placeBet\|recordBet" src/app/(player)/practice src/lib/client/practice.ts` → empty.
- [ ] Manual (staging): /practice from drawer → place practice bet (balance unchanged until simulate; "in play" reflects stake) → simulate → win/lose/push adjusts demo balance → reset. Confirm admin Bets list + DB `bets` count unchanged.
- [ ] Merge → main → prod folder `git pull && npm run build` + restart both (no migration).

## Notes

- The ONLY money-engine touch is importing the pure `gradeBet` for simulation — read-only, no DB. Keep all real placement paths out of `practice/`.
- Demo balance moves on simulate (by net), matching real settle semantics; show open stake as "in play".
