# Final Score on Bets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show each match's final score (`FT 2–1`) on every finished bet in the player My Bets list, ticket detail/PNG, and Balance view, so players can cross-reference the line/pick/outcome against the real result.

**Architecture:** One pure helper `finalScore(status, home, away)` gates display to finished matches with both scores present. Two queries are widened to carry the score/status (`/api/bets` adds `match.homeScore/awayScore`; `playerDayItems` adds `matchStatus` — it already returns the scores). Three call sites render the helper's output. No grading/settlement/schema/money changes.

**Tech Stack:** Next.js 16 App Router, TypeScript, Drizzle/Postgres, Tailwind v4, vitest. Bilingual EN/MM (parity test).

---

## File Structure

- `src/lib/client/format.ts` — **modify**: add pure `finalScore()` helper.
- `src/lib/client/format.test.ts` — **create**: unit test for `finalScore` (no test file exists for `format.ts` yet).
- `src/lib/i18n/en.ts` + `src/lib/i18n/mm.ts` — **modify**: add `finalScore` key.
- `src/app/api/bets/route.ts` — **modify**: add `homeScore`/`awayScore` to the nested `match` select.
- `src/lib/accounting/queries.ts` — **modify**: add `matchStatus` to `playerDayItems` select (scores already present).
- `src/components/TicketCard.tsx` — **modify**: extend `TicketRow["match"]` type; render `Final score` in the on-screen detail and the PNG `rows[]`; bump canvas height.
- `src/app/(player)/bets/page.tsx` — **modify**: render `FT 2–1` in each list row.
- `src/app/(player)/balance/page.tsx` — **modify**: extend `BalanceItem` type; render `FT 2–1` in each item row.

---

## Task 1: `finalScore` helper (pure, TDD)

**Files:**

- Create: `src/lib/client/format.test.ts`
- Modify: `src/lib/client/format.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/client/format.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { finalScore } from "./format";

describe("finalScore", () => {
  it("returns 'home–away' (en-dash) for a finished match with both scores", () => {
    expect(finalScore("finished", 2, 1)).toBe("2–1");
    expect(finalScore("finished", 0, 0)).toBe("0–0");
  });
  it("returns null when the match is not finished", () => {
    expect(finalScore("live", 1, 0)).toBeNull();
    expect(finalScore("scheduled", null, null)).toBeNull();
    expect(finalScore(undefined, 2, 1)).toBeNull();
  });
  it("returns null when either score is missing on a finished match", () => {
    expect(finalScore("finished", null, 1)).toBeNull();
    expect(finalScore("finished", 2, null)).toBeNull();
    expect(finalScore("finished", undefined, undefined)).toBeNull();
  });
});
```

Note: the expected string uses the en-dash `–` (U+2013), not a hyphen `-`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/client/format.test.ts`
Expected: FAIL — no export named `finalScore`.

- [ ] **Step 3: Write the implementation**

In `src/lib/client/format.ts`, add after the `priceSigned` export (around line 8, before the `matchStarted` function):

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/client/format.test.ts`
Expected: PASS (all three `finalScore` cases green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/client/format.ts src/lib/client/format.test.ts
git commit -m "feat: finalScore helper for showing FT result on finished bets"
```

---

## Task 2: i18n `finalScore` key (en + mm, parity-enforced)

**Files:**

- Modify: `src/lib/i18n/en.ts`
- Modify: `src/lib/i18n/mm.ts`

- [ ] **Step 1: Add the key to `en.ts`**

In `src/lib/i18n/en.ts`, immediately after the `scoreAtBet:` line (line 50, `scoreAtBet: "Score at bet",`), add:

```ts
  finalScore: "Final score",
```

- [ ] **Step 2: Run the parity test to verify it FAILS**

Run: `npx vitest run src/lib/i18n/i18n.test.ts`
Expected: FAIL — `mm` is missing `finalScore`.

- [ ] **Step 3: Add the matching key to `mm.ts`**

In `src/lib/i18n/mm.ts`, immediately after the `scoreAtBet:` line (line 55, `scoreAtBet: "လောင်းချိန်ဂိုးရလဒ်",`), add the Burmese machine-draft:

```ts
  finalScore: "နောက်ဆုံးရလဒ်",
```

- [ ] **Step 4: Run the parity test to verify it PASSES**

Run: `npx vitest run src/lib/i18n/i18n.test.ts`
Expected: PASS — "mm covers every en key".

- [ ] **Step 5: Commit**

```bash
git add src/lib/i18n/en.ts src/lib/i18n/mm.ts
git commit -m "i18n: add finalScore label"
```

---

## Task 3: `/api/bets` — select the final score

No unit test (no player-bets API test harness exists). Verified by `npm run build` (TS) and the render task that consumes it.

**Files:**

- Modify: `src/app/api/bets/route.ts`

- [ ] **Step 1: Add the score columns to the nested `match` select**

In `src/app/api/bets/route.ts`, the `GET` handler's `.select({ … })` has a nested `match` object (around lines 98–103). Change it from:

```ts
        match: {
          homeTeam: schema.matches.homeTeam,
          awayTeam: schema.matches.awayTeam,
          stage: schema.matches.stage,
          status: schema.matches.status,
        },
```

to:

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

The matches table is already inner-joined; no new join. Each ticket now returns `match.homeScore` / `match.awayScore` (`number | null`).

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep -E "api/bets|route.ts" || echo "no errors in bets route"`
Expected: `no errors in bets route`. (A pre-existing, unrelated tsc error in `src/lib/client/practice.test.ts` exists on `main` — ignore it; `npm run build` is the real TS gate and runs in Task 7.)

- [ ] **Step 3: Commit**

```bash
git add src/app/api/bets/route.ts
git commit -m "feat: include match final score in /api/bets response"
```

---

## Task 4: `playerDayItems` — select the match status

No unit test (query change). Verified by `npm run build` and the balance render task.

**Files:**

- Modify: `src/lib/accounting/queries.ts`

- [ ] **Step 1: Add `matchStatus` to the select**

In `src/lib/accounting/queries.ts`, the `playerDayItems` `.select({ … })` already returns `finalHomeScore: schema.matches.homeScore` and `finalAwayScore: schema.matches.awayScore` (lines 24–25). Add one field right after them (before the closing `})` on line 26):

```ts
      finalHomeScore: schema.matches.homeScore,
      finalAwayScore: schema.matches.awayScore,
      matchStatus: schema.matches.status,
```

(The matches table is already inner-joined here.) `matchStatus` is named distinctly from the existing flat `status` field, which is the **bet** status.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep -E "queries.ts|accounting" || echo "no errors in queries"`
Expected: `no errors in queries`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/accounting/queries.ts
git commit -m "feat: include match status in playerDayItems for finished-only score display"
```

---

## Task 5: Render the final score in My Bets (list + ticket)

No render-test harness exists; verified by `npm run build` + lint + manual. This task touches the bets list page and the `TicketCard` (detail layout, PNG canvas, and its `TicketRow` type).

**Files:**

- Modify: `src/components/TicketCard.tsx`
- Modify: `src/app/(player)/bets/page.tsx`

- [ ] **Step 1: Extend the `TicketRow` match type**

In `src/components/TicketCard.tsx`, the `TicketRow` type's `match` object currently is:

```ts
  match: {
    homeTeam: string;
    awayTeam: string;
    stage: string;
    status?: "scheduled" | "live" | "finished";
  };
```

Add the two score fields:

```ts
  match: {
    homeTeam: string;
    awayTeam: string;
    stage: string;
    status?: "scheduled" | "live" | "finished";
    homeScore?: number | null;
    awayScore?: number | null;
  };
```

- [ ] **Step 2: Import `finalScore` and compute it once in `TicketCard`**

In `src/components/TicketCard.tsx`, change the format import (currently `import { mmk, signedMmk, pickLabel } from "@/lib/client/format";`) to:

```ts
import { mmk, signedMmk, pickLabel, finalScore } from "@/lib/client/format";
```

Then inside the `TicketCard` component body, just after `const ouLabels = { over: t.over, under: t.under };`, add:

```ts
const ft = finalScore(b.match.status, b.match.homeScore, b.match.awayScore);
```

`ft` is now in scope for both the `save()` closure and the JSX below.

- [ ] **Step 3: Add the Final score row to the PNG canvas**

In the `save()` function: (a) include `ft` in the canvas height, and (b) insert the row into the `rows` array.

Change the height line from:

```ts
const canvasHeight = hasNet ? (hasFee ? 472 : 400) : 360;
```

to:

```ts
const canvasHeight = (hasNet ? (hasFee ? 472 : 400) : 360) + (ft ? 36 : 0);
```

Then, right after the `rows` array is declared (the array literal ending with `[t.statusLbl, t[statusKey(b.status)]],`), insert the Final score row after the "Score at bet" row (index 4):

```ts
if (ft) rows.splice(5, 0, [t.finalScore, ft]);
```

- [ ] **Step 4: Add the Final score row to the on-screen ticket detail**

In the `<dl>` block, find the existing Score-at-bet row:

```tsx
<Row k={t.scoreAtBet} v={`${b.scoreHomeAtBet}–${b.scoreAwayAtBet}`} />
```

and add the Final score row immediately after it:

```tsx
{
  ft && <Row k={t.finalScore} v={ft} />;
}
```

- [ ] **Step 5: Render `FT 2–1` in each My Bets list row**

In `src/app/(player)/bets/page.tsx`, add `finalScore` to the format import (currently `import { pickLabel } from "@/lib/client/format";`):

```ts
import { pickLabel, finalScore } from "@/lib/client/format";
```

Then convert the `tickets.map` callback from an implicit-return arrow to a block that computes `ft`, and render it under the pick line. Change:

```tsx
      {tickets.map((b) => (
        <button
          key={b.ticketNo}
          className="mb-2 w-full rounded-xl border border-border bg-surface p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
          onClick={() => setSelected(b)}
        >
```

to:

```tsx
      {tickets.map((b) => {
        const ft = finalScore(
          b.match.status,
          b.match.homeScore,
          b.match.awayScore,
        );
        return (
        <button
          key={b.ticketNo}
          className="mb-2 w-full rounded-xl border border-border bg-surface p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
          onClick={() => setSelected(b)}
        >
```

Then, find the pick line:

```tsx
<div className="text-base text-muted">
  {pickLabel(b.line, b.match, b.side, {
    over: t.over,
    under: t.under,
  })}
</div>
```

and add the FT line immediately after it:

```tsx
{
  ft && (
    <div className="text-base text-faint">
      {t.finished} {ft}
    </div>
  );
}
```

Finally, close the new block body. The map currently ends:

```tsx
        </button>
      ))}
```

Change it to:

```tsx
        </button>
        );
      })}
```

- [ ] **Step 6: Type-check + lint**

Run: `npx tsc --noEmit 2>&1 | grep -E "TicketCard|bets/page" || echo "no errors in My Bets files"` then `npm run lint 2>&1 | grep -E "TicketCard|bets/page" || echo "lint clean for My Bets files"`
Expected: `no errors in My Bets files` and `lint clean for My Bets files`. (Ignore the pre-existing `practice.test.ts` tsc error.)

- [ ] **Step 7: Commit**

```bash
git add src/components/TicketCard.tsx "src/app/(player)/bets/page.tsx"
git commit -m "feat: show FT final score in My Bets list, ticket detail, and PNG"
```

---

## Task 6: Render the final score in Balance

No render-test harness; verified by build + lint + manual.

**Files:**

- Modify: `src/app/(player)/balance/page.tsx`

- [ ] **Step 1: Extend the `BalanceItem` type**

In `src/app/(player)/balance/page.tsx`, the `BalanceItem` type ends with `homeTeam: string;` and `awayTeam: string;`. Add three fields to it:

```ts
homeTeam: string;
awayTeam: string;
finalHomeScore: number | null;
finalAwayScore: number | null;
matchStatus: "scheduled" | "live" | "finished";
```

- [ ] **Step 2: Import `finalScore`**

Change the format import (currently `import { signedMmk, mmk, pickLabel } from "@/lib/client/format";`) to:

```ts
import { signedMmk, mmk, pickLabel, finalScore } from "@/lib/client/format";
```

- [ ] **Step 3: Compute and render the FT line per item**

In the `day.items.map((item) => { … })` callback, after the existing `const pickStr = pickLabel(…);` (and before the `const fee = …` line), add:

```ts
const ft = finalScore(
  item.matchStatus,
  item.finalHomeScore,
  item.finalAwayScore,
);
```

Then find the pick line in the returned JSX:

```tsx
<div className="text-base text-ink">{pickStr}</div>
```

and add the FT line immediately after it:

```tsx
{
  ft && (
    <div className="text-sm text-faint">
      {t.finished} {ft}
    </div>
  );
}
```

- [ ] **Step 4: Type-check + lint**

Run: `npx tsc --noEmit 2>&1 | grep -E "balance/page" || echo "no errors in balance page"` then `npm run lint 2>&1 | grep -E "balance/page" || echo "lint clean for balance page"`
Expected: `no errors in balance page` and `lint clean for balance page`.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(player)/balance/page.tsx"
git commit -m "feat: show FT final score on Balance item rows"
```

---

## Task 7: Full verification

**Files:** none (gate only).

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: PASS — includes the new `format.test.ts` (`finalScore`) and `i18n.test.ts` parity (with `finalScore`). All prior tests still green.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: 0 errors (pre-existing warnings in unrelated test files are fine).

- [ ] **Step 3: Production build (TS + Next gate)**

Run: `npm run build`
Expected: build succeeds; `/bets` and `/balance` compile.

- [ ] **Step 4: Manual eyeball (dev server)**

Run `npm run dev`, log in as a player on a mobile viewport, and confirm:

- **My Bets** — a bet on a **finished** match shows `FT 2–1` under the pick; a **pending** bet on a scheduled/live match shows **no** score line. Open the ticket detail: it shows a `Final score: 2–1` row (after "Score at bet"); "💾 Save ticket" downloads a PNG that includes the `Final score` row (not clipped).
- **Balance** — finished bets show `FT 2–1` under the pick; pending/live ones show no score line.

Expected: all hold. Per the deploy convention, also eyeball on the staging interface after pushing. No DB migration in this change, so `db:migrate` is **not** required.

- [ ] **Step 5: No commit** (verification only). If a step fails, fix in the relevant task's file and re-run Steps 1–3.

---

## Notes for the implementer

- **Display-only.** No file under `src/lib/engine/`, `src/lib/bets/`, `src/lib/accounting/settle.ts`, the schema, or any settlement/money path is touched. Tasks 3–4 only widen `SELECT` projections; the score columns already exist and are populated at settlement.
- **Caller-agnostic helper.** `finalScore` takes loose `(status, home, away)` so the bets path passes `b.match.status / b.match.homeScore / b.match.awayScore` and the balance path passes `item.matchStatus / item.finalHomeScore / item.finalAwayScore` (the names `playerDayItems` already returns). Don't unify these field names — each call site uses what its query returns.
- **Why gate on match status, not "scores present":** `playerDayItems` excludes only `void` bets, so a still-`pending` bet on a **live** match carries a non-null in-play score; gating on `status === "finished"` keeps the line "final result only".
- **En-dash.** Use `–` (U+2013) in `finalScore`, matching the existing `scoreHomeAtBet–scoreAwayAtBet` separator in `TicketCard` and the match-card score.

```

```
