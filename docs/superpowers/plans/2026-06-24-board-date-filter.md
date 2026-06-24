# By Day Date Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `{Previous | Today | Tomorrow}` chip row to the player board's By Day view that filters the listed matches to yesterday / today / tomorrow (MMT), defaulting to Today.

**Architecture:** A new pure `yesterdayMmt()` helper plus a `dateBucket` state in `MatchesPage`. The chip row renders only in By Day mode (reusing the existing `TabButton`); the chosen bucket maps to one MMT date passed to `ByDay`, which filters `matches` by `matchDay` before its existing grouping. By Group is untouched. No schema/API/grading change.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind v4, vitest. Bilingual EN/MM (parity test).

---

## File Structure

- `src/lib/client/format.ts` — **modify**: add pure `yesterdayMmt()`.
- `src/lib/client/format.test.ts` — **modify**: add `yesterdayMmt` test (file already exists).
- `src/lib/i18n/en.ts` + `src/lib/i18n/mm.ts` — **modify**: add `previous` + `noMatchesDay` keys.
- `src/app/(player)/page.tsx` — **modify**: `dateBucket` state, chip row (reusing `TabButton`), `targetDay` mapping, and `ByDay` gains a `targetDay` prop + filter + empty message.

---

## Task 1: `yesterdayMmt` helper (pure, TDD)

**Files:**

- Modify: `src/lib/client/format.ts`
- Modify: `src/lib/client/format.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/lib/client/format.test.ts`, update the import to include the helpers (the file currently imports only `finalScore`):

```ts
import { finalScore, yesterdayMmt, todayMmt } from "./format";
```

Then append this block:

```ts
describe("yesterdayMmt", () => {
  it("is formatted YYYY-MM-DD", () => {
    expect(yesterdayMmt()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it("is exactly one day before todayMmt()", () => {
    const y = new Date(`${yesterdayMmt()}T00:00:00Z`).getTime();
    const today = new Date(`${todayMmt()}T00:00:00Z`).getTime();
    expect(today - y).toBe(86_400_000);
  });
});
```

(Comparing the two helpers' own outputs keeps this deterministic without mocking the clock.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/client/format.test.ts`
Expected: FAIL — no export named `yesterdayMmt`.

- [ ] **Step 3: Write the implementation**

In `src/lib/client/format.ts`, immediately after the `tomorrowMmt()` function (ends around line 54), add:

```ts
/** Yesterday's date in MMT, formatted YYYY-MM-DD. */
export function yesterdayMmt(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Yangon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(Date.now() - 86_400_000));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/client/format.test.ts`
Expected: PASS (the `finalScore` block and the new `yesterdayMmt` block all green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/client/format.ts src/lib/client/format.test.ts
git commit -m "feat: yesterdayMmt date helper"
```

---

## Task 2: i18n keys `previous` + `noMatchesDay` (en + mm, parity-enforced)

**Files:**

- Modify: `src/lib/i18n/en.ts`
- Modify: `src/lib/i18n/mm.ts`

- [ ] **Step 1: Add keys to `en.ts`**

In `src/lib/i18n/en.ts`, immediately after the `tomorrow: "Tomorrow",` line (line 115), add:

```ts
  previous: "Previous",
  noMatchesDay: "No matches",
```

- [ ] **Step 2: Run the parity test to verify it FAILS**

Run: `npx vitest run src/lib/i18n/i18n.test.ts`
Expected: FAIL — `mm` is missing `previous` and `noMatchesDay`.

- [ ] **Step 3: Add the matching keys to `mm.ts`**

In `src/lib/i18n/mm.ts`, find the `tomorrow:` key and add immediately after it (Burmese machine-draft, per the file's convention):

```ts
  previous: "ယခင်",
  noMatchesDay: "ပွဲစဉ်မရှိပါ",
```

- [ ] **Step 4: Run the parity test to verify it PASSES**

Run: `npx vitest run src/lib/i18n/i18n.test.ts`
Expected: PASS — "mm covers every en key".

- [ ] **Step 5: Commit**

```bash
git add src/lib/i18n/en.ts src/lib/i18n/mm.ts
git commit -m "i18n: add previous + noMatchesDay labels"
```

---

## Task 3: Date chip row + By Day filter

No render-test harness exists; verified by `npm run build` + lint + manual. All edits are in one file.

**Files:**

- Modify: `src/app/(player)/page.tsx`

- [ ] **Step 1: Import `yesterdayMmt`**

The page currently imports (around lines 10–15):

```ts
import {
  todayMmt,
  tomorrowMmt,
  dayLabel,
  stageSection,
} from "@/lib/client/format";
```

Add `yesterdayMmt`:

```ts
import {
  todayMmt,
  tomorrowMmt,
  yesterdayMmt,
  dayLabel,
  stageSection,
} from "@/lib/client/format";
```

- [ ] **Step 2: Add the `DateBucket` type and state**

Find the existing `type View = "day" | "group";` (line 19) and add a sibling type right after it:

```ts
type DateBucket = "previous" | "today" | "tomorrow";
```

Then in `MatchesPage`, just after `const [view, setView] = useState<View>("day");` (line 25), add:

```ts
const [dateBucket, setDateBucket] = useState<DateBucket>("today");
```

- [ ] **Step 3: Compute `targetDay`**

In `MatchesPage`, just before the `return (` (line 53), add:

```ts
const targetDay =
  dateBucket === "previous"
    ? yesterdayMmt()
    : dateBucket === "tomorrow"
      ? tomorrowMmt()
      : todayMmt();
```

- [ ] **Step 4: Render the chip row (By Day only) and pass `targetDay` to `ByDay`**

In the JSX, immediately AFTER the primary toggle `</div>` (line 63, the closing div of the `{By Day | By Group}` toggle) and BEFORE the practice `<Link>` (line 65), insert:

```tsx
{
  view === "day" && (
    <div className="mb-4 flex gap-1 rounded-xl bg-surface-2 p-1">
      <TabButton
        active={dateBucket === "previous"}
        onClick={() => setDateBucket("previous")}
      >
        {t.previous}
      </TabButton>
      <TabButton
        active={dateBucket === "today"}
        onClick={() => setDateBucket("today")}
      >
        {t.today}
      </TabButton>
      <TabButton
        active={dateBucket === "tomorrow"}
        onClick={() => setDateBucket("tomorrow")}
      >
        {t.tomorrow}
      </TabButton>
    </div>
  );
}
```

Then change the By Day render call (line 75) from:

```tsx
<ByDay matches={matches} onPick={onPick} t={t} />
```

to:

```tsx
<ByDay matches={matches} onPick={onPick} t={t} targetDay={targetDay} />
```

- [ ] **Step 5: Add the `targetDay` prop to `ByDay` and filter by it**

Change the `ByDay` function signature (lines 123–133) from:

```tsx
function ByDay({
  matches,
  onPick,
  t,
}: {
  matches: MatchRow[];
  onPick: (
    m: MatchRow,
  ) => (market: "ah" | "ou", side: "fav" | "dog" | "over" | "under") => void;
  t: Dict;
}) {
```

to (add `targetDay` to both the destructure and the prop type):

```tsx
function ByDay({
  matches,
  onPick,
  t,
  targetDay,
}: {
  matches: MatchRow[];
  onPick: (
    m: MatchRow,
  ) => (market: "ah" | "ou", side: "fav" | "dog" | "over" | "under") => void;
  t: Dict;
  targetDay: string;
}) {
```

Then change the `board` line (line 137) from:

```tsx
// All statuses share the uniform card; finished matches show as COMPLETED.
const board = matches;
```

to:

```tsx
// Show only the matches for the selected date bucket (Previous/Today/Tomorrow).
// All statuses share the uniform card; finished matches show as COMPLETED.
const board = matches.filter((m) => m.matchDay === targetDay);
```

- [ ] **Step 6: Use the "No matches" empty message in `ByDay`**

Change the empty-state line (line 150) from:

```tsx
return <p className="mt-8 text-center text-faint">{t.noBets}</p>;
```

to:

```tsx
return <p className="mt-8 text-center text-faint">{t.noMatchesDay}</p>;
```

(The `today`/`tomorrow` consts and `dayLabel` usage inside `ByDay` stay as-is — the sticky header still shows the friendly date.)

- [ ] **Step 7: Type-check + lint**

Run: `npx tsc --noEmit 2>&1 | grep -E "player\)/page|page.tsx" || echo "no errors in board page"`
then `npm run lint 2>&1 | grep -E "player\)/page|page.tsx" || echo "lint clean for board page"`
Expected: `no errors in board page` and `lint clean for board page`. (A pre-existing unrelated tsc error in `src/lib/client/practice.test.ts` exists on `main` — ignore it. Prettier runs via a hook on save — auto-formatting is fine.)

- [ ] **Step 8: Commit**

```bash
git add "src/app/(player)/page.tsx"
git commit -m "feat: Previous/Today/Tomorrow date filter on the By Day board"
```

---

## Task 4: Full verification

**Files:** none (gate only).

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: PASS — includes the new `yesterdayMmt` test and the i18n parity test (with `previous` + `noMatchesDay`). All prior tests still green.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: 0 errors (pre-existing warnings in unrelated test files are fine).

- [ ] **Step 3: Production build (TS + Next gate)**

Run: `npm run build`
Expected: build succeeds; the board route (`/`) compiles.

- [ ] **Step 4: Manual eyeball (dev server)**

Run `npm run dev`, log in as a player on a mobile viewport, and on the board:

- The **By Day** view shows a second chip row `Previous · Today · Tomorrow`, with **Today** active by default; the list shows only today's matches.
- Tapping **Tomorrow** shows tomorrow's scheduled matches; **Previous** shows yesterday's (rendered as COMPLETED cards). Matches 2+ days out do not appear.
- A bucket with no matches shows **"No matches"** (not "No bets yet").
- Switching to **By Group** hides the chip row and shows all fixtures as before.

Expected: all hold. Per the deploy convention, also eyeball on staging after pushing. No DB migration in this change, so `db:migrate` is **not** required.

- [ ] **Step 5: No commit** (verification only). If a step fails, fix in the relevant task's file and re-run Steps 1–3.

---

## Notes for the implementer

- **UI-only.** No schema/API/grading/settlement/money path is touched. `matchDay` is an existing `YYYY-MM-DD` MMT string on each match row, matching the format `todayMmt()` / `tomorrowMmt()` / `yesterdayMmt()` produce, so the equality filter is exact.
- **Reuse `TabButton`.** The date chips reuse the existing `TabButton` (already `flex-1`, so three segments fill the row) — no new component. Do not alter the primary `{By Day | By Group}` toggle.
- **By Group is untouched.** It ignores `dateBucket` entirely; the chip row is hidden when `view === "group"`.
- **Bucket is component state**, default Today each load; it survives SSE `reload()` (which only refreshes `matches`).

```

```
