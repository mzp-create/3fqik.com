# Uniform Player Match Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every match on the player **By Day** board the same 6-row card skeleton (colored status header, names+codes, circular flag images, score, schedule, betting/status action area), and show finished matches in the board.

**Architecture:** Pure helper `flagSrc()` resolves a FIFA code to a bundled square-SVG path; a one-time script copies the needed SVGs from `flag-icons` into `public/flags/`. `MatchCard.tsx` is rebuilt around a fixed skeleton with a status-driven row-6 action area; existing AH/OU betting markup and `onPick` are preserved. `ByDay` stops filtering finished matches. No money/grading/schema changes.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind v4 (dark tokens), vitest, `flag-icons` (devDependency, SVG source only), `tsx` script runner.

---

## File Structure

- `src/lib/client/flags.ts` — **modify**: add pure `flagSrc(code)` helper. Existing `flag()`, `teamName()`, `teamLabel()`, reverse-lookup untouched.
- `src/lib/client/flags.test.ts` — **modify**: add `flagSrc` test block.
- `scripts/copy-flags.ts` — **create**: copies square SVGs from `flag-icons` into `public/flags/`.
- `public/flags/*.svg` — **create** (~49 committed assets).
- `package.json` — **modify**: add `flag-icons` devDependency + `flags:copy` script.
- `src/lib/i18n/en.ts` + `src/lib/i18n/mm.ts` — **modify**: add 7 keys (parity test enforces).
- `src/components/MatchCard.tsx` — **rebuild**: 6-row skeleton, `FlagCircle`/`StatusChip`/`TeamColumn`/`CenterCell` subcomponents, row-6 state machine.
- `src/app/(player)/page.tsx` — **modify**: `ByDay` no longer filters `status === "finished"`.

---

## Task 1: `flagSrc` helper (pure, TDD)

**Files:**

- Modify: `src/lib/client/flags.ts`
- Test: `src/lib/client/flags.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/client/flags.test.ts` (and add `flagSrc` to the import on line 2: `import { flag, teamName, teamLabel, flagSrc } from "./flags";`):

```ts
describe("flagSrc", () => {
  it("maps finalist codes to lowercase iso2 svg paths", () => {
    expect(flagSrc("MEX")).toBe("/flags/mx.svg");
    expect(flagSrc("RSA")).toBe("/flags/za.svg"); // South Africa → za
    expect(flagSrc("SUI")).toBe("/flags/ch.svg"); // Switzerland → ch
    expect(flagSrc("USA")).toBe("/flags/us.svg");
  });
  it("maps England and Scotland to GB regional svgs", () => {
    expect(flagSrc("ENG")).toBe("/flags/gb-eng.svg");
    expect(flagSrc("SCO")).toBe("/flags/gb-sct.svg");
  });
  it("returns null for knockout placeholders and unknowns", () => {
    for (const code of ["1H", "W73", "3C/D/F", "XYZ", ""]) {
      expect(flagSrc(code)).toBeNull();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/client/flags.test.ts`
Expected: FAIL — `flagSrc is not a function` / no export named `flagSrc`.

- [ ] **Step 3: Write the implementation**

In `src/lib/client/flags.ts`, after the existing `flag()` function (around line 67), add:

```ts
// flag-icons uses GB regional SVGs for England/Scotland (no ISO2 of their own).
const SPECIAL_ISO: Record<string, string> = {
  ENG: "gb-eng",
  SCO: "gb-sct",
};

/** Path to the bundled square SVG (in /public/flags) for a FIFA code, or null
 *  for bracket placeholders / unknowns (e.g. "W73"). Rendered circular by the
 *  FlagCircle component. */
export function flagSrc(code: string): string | null {
  if (SPECIAL_ISO[code]) return `/flags/${SPECIAL_ISO[code]}.svg`;
  const iso = FIFA_TO_ISO2[code];
  if (!iso) return null;
  return `/flags/${iso.toLowerCase()}.svg`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/client/flags.test.ts`
Expected: PASS (all `flag`, `teamName/teamLabel`, and `flagSrc` blocks green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/client/flags.ts src/lib/client/flags.test.ts
git commit -m "feat: flagSrc helper mapping FIFA codes to bundled flag SVG paths"
```

---

## Task 2: Bundle flag SVG assets

No unit test (asset/build step). Verified by file existence + a build later.

**Files:**

- Create: `scripts/copy-flags.ts`
- Modify: `package.json`
- Create: `public/flags/*.svg`

- [ ] **Step 1: Add the `flag-icons` devDependency**

Run: `npm install --save-dev flag-icons`
Expected: `flag-icons` added under `devDependencies`; `node_modules/flag-icons/flags/1x1/` exists.

Verify the square SVGs we need are present:
Run: `ls node_modules/flag-icons/flags/1x1/mx.svg node_modules/flag-icons/flags/1x1/gb-eng.svg node_modules/flag-icons/flags/1x1/gb-sct.svg`
Expected: all three paths listed (no "No such file").

- [ ] **Step 2: Create the copy script**

Create `scripts/copy-flags.ts`:

```ts
// Copies the square (1x1) SVG flags WC2026 needs from the flag-icons package
// into public/flags/, so the PWA ships them offline (no runtime dependency on
// the package). Re-run if the finalist list changes.
//   npm run flags:copy
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

// Lowercase ISO2 for every WC2026 finalist (mirrors FIFA_TO_ISO2 in
// src/lib/client/flags.ts) plus GB regional codes for England/Scotland.
const ISO = [
  "mx",
  "za",
  "kr",
  "cz",
  "ca",
  "ba",
  "qa",
  "ch",
  "br",
  "ma",
  "ht",
  "us",
  "py",
  "au",
  "tr",
  "de",
  "cw",
  "ci",
  "ec",
  "nl",
  "jp",
  "se",
  "tn",
  "be",
  "eg",
  "ir",
  "nz",
  "es",
  "cv",
  "sa",
  "uy",
  "fr",
  "sn",
  "iq",
  "no",
  "ar",
  "dz",
  "at",
  "jo",
  "pt",
  "cd",
  "uz",
  "co",
  "hr",
  "gh",
  "pa",
  "gb-eng",
  "gb-sct",
];

const srcDir = join(
  process.cwd(),
  "node_modules",
  "flag-icons",
  "flags",
  "1x1",
);
const destDir = join(process.cwd(), "public", "flags");
mkdirSync(destDir, { recursive: true });

let copied = 0;
const missing: string[] = [];
for (const iso of ISO) {
  const from = join(srcDir, `${iso}.svg`);
  if (!existsSync(from)) {
    missing.push(iso);
    continue;
  }
  copyFileSync(from, join(destDir, `${iso}.svg`));
  copied++;
}

console.log(`Copied ${copied}/${ISO.length} flags to public/flags/`);
if (missing.length) {
  console.error(`MISSING in flag-icons: ${missing.join(", ")}`);
  process.exit(1);
}
```

- [ ] **Step 3: Add the npm script**

In `package.json` `"scripts"`, add (next to the other `tsx` scripts):

```json
"flags:copy": "tsx scripts/copy-flags.ts",
```

- [ ] **Step 4: Run the script**

Run: `npm run flags:copy`
Expected: `Copied 48/48 flags to public/flags/` (or 49/49) and **no** "MISSING" line. If any code is missing, the script exits non-zero — investigate the flag-icons filename for that code before continuing.

Verify: `ls public/flags/ | wc -l` → matches the copied count; `ls public/flags/mx.svg public/flags/gb-eng.svg` both exist.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json scripts/copy-flags.ts public/flags
git commit -m "feat: bundle WC2026 square flag SVGs into public/flags"
```

---

## Task 3: i18n keys (en + mm, parity-enforced)

**Files:**

- Modify: `src/lib/i18n/en.ts`
- Modify: `src/lib/i18n/mm.ts`
- Test: `src/lib/i18n/i18n.test.ts` (no edit — it auto-checks parity)

- [ ] **Step 1: Add keys to `en.ts`**

In `src/lib/i18n/en.ts`, just after the `matchStartedNote` line (around line 38), add:

```ts
  statusScheduled: "SCHEDULED",
  statusCompleted: "COMPLETED",
  vs: "vs",
  linesSoon: "Lines coming soon",
  kicksOff: "Kicks off",
  bettingClosedLive: "Betting closed — in play",
  matchFinishedNote: "Match finished",
```

- [ ] **Step 2: Run the parity test to verify it now FAILS**

Run: `npx vitest run src/lib/i18n/i18n.test.ts`
Expected: FAIL — `mm` is missing the 7 new keys (arrays not equal). This confirms the test guards parity.

- [ ] **Step 3: Add the same keys to `mm.ts`**

In `src/lib/i18n/mm.ts`, add the matching keys (Burmese machine-draft per the file's convention) near the corresponding cluster:

```ts
  statusScheduled: "ထွက်မည်",
  statusCompleted: "ပြီးဆုံး",
  vs: "နှင့်",
  linesSoon: "လောင်းကြေး မကြာမီ ဖွင့်မည်",
  kicksOff: "ပွဲစမည်",
  bettingClosedLive: "လောင်းကြေးပိတ် — ပွဲစားနေသည်",
  matchFinishedNote: "ပွဲပြီးဆုံးပါပြီ",
```

- [ ] **Step 4: Run the parity test to verify it PASSES**

Run: `npx vitest run src/lib/i18n/i18n.test.ts`
Expected: PASS — `mm covers every en key`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/i18n/en.ts src/lib/i18n/mm.ts
git commit -m "i18n: add match-card status + betting-state strings"
```

---

## Task 4: Rebuild `MatchCard` with the uniform 6-row skeleton

No render-test harness exists; verified by TypeScript (via `npm run build`), lint, and manual eyeball. Betting logic (`onPick`, AH tiles, OU toggle, `matchStarted` gate) is preserved.

**Files:**

- Modify (full rewrite): `src/components/MatchCard.tsx`

- [ ] **Step 1: Replace the file contents**

Overwrite `src/components/MatchCard.tsx` with:

```tsx
"use client";
import { useState } from "react";
import { useT } from "@/lib/i18n";
import type { Dict } from "@/lib/i18n/en";
import { ball, priceSigned, matchStarted } from "@/lib/client/format";
import { teamName, flagSrc } from "@/lib/client/flags";

export type LineRow = {
  id: number;
  version: number;
  favSide: "home" | "away";
  offeredSide: "fav" | "dog" | "over" | "under";
  ballQ: number;
  priceC: number; // primary side (fav/over)
  priceOppC: number | null; // opposite side (dog/under)
  status: string;
  market?: "ah" | "ou";
};
export type MatchRow = {
  id: number;
  stage: string;
  homeTeam: string;
  awayTeam: string;
  kickoffUtc: string;
  matchDay: string;
  status: "scheduled" | "live" | "finished";
  homeScore: number | null;
  awayScore: number | null;
  line: LineRow | null;
  ouLine?: LineRow | null;
};

const yangon = (opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Yangon", ...opts });

/** Circular flag image; neutral code-chip when the team has no flag (e.g. "W73"). */
function FlagCircle({ code }: { code: string }) {
  const src = flagSrc(code);
  return (
    <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-surface-2 ring-1 ring-border">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={code} className="h-full w-full object-cover" />
      ) : (
        <span className="text-[11px] font-bold text-faint">{code}</span>
      )}
    </span>
  );
}

/** Row-1 status chip — color differs per status. */
function StatusChip({ status, t }: { status: MatchRow["status"]; t: Dict }) {
  if (status === "live")
    return (
      <span className="flex items-center gap-1.5 rounded-sm bg-ca px-2 py-0.5 text-sm font-semibold uppercase tracking-wide text-white">
        <span className="live-dot h-1.5 w-1.5 rounded-full bg-white" />
        {t.live}
      </span>
    );
  if (status === "finished")
    return (
      <span className="rounded-sm bg-surface-2 px-2 py-0.5 text-sm font-semibold uppercase tracking-wide text-mx-neon/80">
        {t.statusCompleted}
      </span>
    );
  return (
    <span className="rounded-sm bg-surface-2 px-2 py-0.5 text-sm font-semibold uppercase tracking-wide text-muted">
      {t.statusScheduled}
    </span>
  );
}

/** Rows 2–3 per team: name, code, circular flag (center-aligned column). */
function TeamColumn({ code }: { code: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center">
      <span className="max-w-full truncate text-base font-bold text-ink">
        {teamName(code)}
      </span>
      <span className="text-xs font-semibold text-faint">{code}</span>
      <FlagCircle code={code} />
    </div>
  );
}

/** Center cell: "vs" for scheduled, score (Anton) for live/finished. */
function CenterCell({ m, t }: { m: MatchRow; t: Dict }) {
  const showScore = m.status === "live" || m.status === "finished";
  if (!showScore)
    return <span className="font-display pt-1 text-xl text-faint">{t.vs}</span>;
  return (
    <span
      className={`font-display whitespace-nowrap pt-1 text-3xl ${
        m.status === "live" ? "text-ca" : "text-ink"
      }`}
    >
      {m.homeScore ?? 0}
      <span className="px-1 text-muted">–</span>
      {m.awayScore ?? 0}
    </span>
  );
}

/** Row-6 status note (non-betting states), kept at a consistent height. */
function ActionNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex min-h-[72px] items-center justify-center rounded-lg bg-raised px-3 py-2 text-center text-sm font-semibold text-muted">
      {children}
    </p>
  );
}

/** Two-tile AH/OU market block (favourite/over + optional opposite). */
function MarketTiles({
  line: l,
  labels,
  onPick,
}: {
  line: LineRow;
  labels: { fav: string; dog: string };
  onPick: (side: "fav" | "dog" | "over" | "under") => void;
}) {
  const isOu = l.market === "ou";
  const favSide = isOu ? "over" : "fav";
  const dogSide = isOu ? "under" : "dog";
  return (
    <div className="flex gap-2">
      {/* Favourite / Over — green rail */}
      <button
        className="relative flex-1 overflow-hidden rounded-lg border-2 border-border bg-raised p-4 text-left font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
        style={{ minHeight: "72px" }}
        onClick={() => onPick(favSide)}
      >
        <span className="absolute inset-y-0 left-0 w-1.5 bg-mx" />
        <span className="block pl-2 text-base font-bold uppercase tracking-wider text-ink">
          {labels.fav}
        </span>
        <span className="block pl-2 text-base text-muted">
          {isOu ? "Over" : `−${ball(l.ballQ)}`}
        </span>
        <span className="font-display block pl-2 text-3xl text-mx-neon">
          {priceSigned(l.priceC)}
        </span>
      </button>
      {/* Underdog / Under — blue rail (only when priced) */}
      {l.priceOppC != null && (
        <button
          className="relative flex-1 overflow-hidden rounded-lg border-2 border-border bg-raised p-4 text-left font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
          style={{ minHeight: "72px" }}
          onClick={() => onPick(dogSide)}
        >
          <span className="absolute inset-y-0 left-0 w-1.5 bg-us" />
          <span className="block pl-2 text-base font-bold uppercase tracking-wider text-ink">
            {labels.dog}
          </span>
          <span className="block pl-2 text-base text-muted">
            {isOu ? "Under" : `+${ball(l.ballQ)}`}
          </span>
          <span className="font-display block pl-2 text-3xl text-us-neon">
            {priceSigned(l.priceOppC)}
          </span>
        </button>
      )}
    </div>
  );
}

export function MatchCard({
  match: m,
  onPick,
}: {
  match: MatchRow;
  onPick: (market: "ah" | "ou", side: "fav" | "dog" | "over" | "under") => void;
}) {
  const { t } = useT();
  const [showOu, setShowOu] = useState(false);
  const l = m.line;
  const ou = m.ouLine ?? null;
  const favLabel = l?.favSide === "home" ? m.homeTeam : m.awayTeam;
  const dogLabel = l?.favSide === "home" ? m.awayTeam : m.homeTeam;

  const dt = new Date(m.kickoffUtc);
  const koTime = yangon({
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(dt);
  const schedule = `${yangon({ weekday: "short", day: "2-digit", month: "short" }).format(dt)} · ${koTime}`;

  const started = matchStarted(m);
  const hasOpenAh = !!l && l.status !== "closed";
  const hasOpenOu = !!ou && ou.status !== "closed";

  // ── Row 6: betting tiles or a status message ────────────────────────
  function renderAction() {
    if (m.status === "live")
      return <ActionNote>⏸ {t.bettingClosedLive}</ActionNote>;
    if (m.status === "finished")
      return <ActionNote>✓ {t.matchFinishedNote}</ActionNote>;
    // scheduled:
    if (started) return <ActionNote>⏸ {t.matchStartedNote}</ActionNote>;
    if (!hasOpenAh && !hasOpenOu)
      return (
        <ActionNote>
          {t.linesSoon} · {t.kicksOff} {koTime}
        </ActionNote>
      );
    return (
      <div className="space-y-2">
        {hasOpenAh &&
          (l!.status === "suspended" ? (
            <ActionNote>⏸ {t.suspended}</ActionNote>
          ) : (
            <MarketTiles
              line={{ ...l!, market: "ah" }}
              labels={{ fav: teamName(favLabel), dog: teamName(dogLabel) }}
              onPick={(side) => onPick("ah", side)}
            />
          ))}
        {hasOpenOu && (
          <div>
            <button
              onClick={() => setShowOu((v) => !v)}
              aria-expanded={showOu}
              className="flex w-full items-center justify-between rounded-lg px-1 py-1.5 text-sm font-semibold text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
            >
              <span>
                {t.marketOu}
                {ou!.status === "suspended" ? "" : ` ${ball(ou!.ballQ)}`}
              </span>
              <span>{showOu ? `${t.hideOu} ⌃` : `${t.showOu} ⌄`}</span>
            </button>
            {showOu &&
              (ou!.status === "suspended" ? (
                <ActionNote>⏸ {t.suspended}</ActionNote>
              ) : (
                <MarketTiles
                  line={{ ...ou!, market: "ou" }}
                  labels={{
                    fav: `O ${ball(ou!.ballQ)}`,
                    dog: `U ${ball(ou!.ballQ)}`,
                  }}
                  onPick={(side) => onPick("ou", side)}
                />
              ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mb-2 rounded-xl border border-border bg-surface p-4 shadow-sm">
      {/* Row 1 — status + stage */}
      <div className="mb-3 flex items-center justify-between">
        <StatusChip status={m.status} t={t} />
        <span className="text-xs font-semibold uppercase tracking-wider text-faint">
          {m.stage}
        </span>
      </div>

      {/* Rows 2–4 — names/codes, flags, score */}
      <div className="flex items-start gap-2">
        <TeamColumn code={m.homeTeam} />
        <div className="flex flex-col items-center self-center px-1">
          <CenterCell m={m} t={t} />
        </div>
        <TeamColumn code={m.awayTeam} />
      </div>

      {/* Row 5 — schedule */}
      <p className="mt-3 text-center text-sm text-muted">{schedule}</p>

      {/* Row 6 — action area */}
      <div className="mt-2">{renderAction()}</div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check + lint the component**

Run: `npx tsc --noEmit && npm run lint`
Expected: no type errors; no lint errors (the inline `eslint-disable-next-line @next/next/no-img-element` suppresses the `<img>` warning).

If `npx tsc --noEmit` is not wired, rely on `npm run build` in Task 6 for the TS gate and run `npm run lint` alone here.

- [ ] **Step 3: Commit**

```bash
git add src/components/MatchCard.tsx
git commit -m "feat: uniform 6-row match card (status header, circular flags, score, action area)"
```

---

## Task 5: Show finished matches in the day board

**Files:**

- Modify: `src/app/(player)/page.tsx`

- [ ] **Step 1: Stop filtering finished out of the board**

In `src/app/(player)/page.tsx`, in the `ByDay` function (around line 136), change:

```ts
const board = matches.filter((m) => m.status !== "finished");
```

to:

```ts
// All statuses share the uniform card; finished matches show as COMPLETED.
const board = matches;
```

(The day grouping, sticky headers, and `MatchCard` rendering below are unchanged.)

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit` (or rely on `npm run build` in Task 6)
Expected: no errors — `board` is still `MatchRow[]`.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(player)/page.tsx"
git commit -m "feat: show finished matches as COMPLETED cards in the day board"
```

---

## Task 6: Full verification

**Files:** none (gate only).

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS — including `flags.test.ts` (with `flagSrc`) and `i18n.test.ts` (parity with the 7 new keys). ~231+ tests green.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 3: Production build (TypeScript + Next build gate)**

Run: `npm run build`
Expected: build succeeds; no type errors; `/` (player board) compiles.

- [ ] **Step 4: Manual eyeball (dev server)**

Run: `npm run dev`, open `http://localhost:3000` on a mobile viewport, log in as a player, and confirm on the **By Day** board:

- A **scheduled match with an open line** shows AH tiles (+ OU toggle) in row 6.
- A **scheduled match with no line** shows `Lines coming soon · Kicks off HH:MM`.
- A **live match** shows the `● LIVE` red chip, the score in red, and `⏸ Betting closed — in play`.
- A **finished match** now appears in the board with the `COMPLETED` chip, final score, and `✓ Match finished`.
- Circular flag images render for both teams (placeholder code-circle for knockout `W73`-style fixtures).
- Cards across statuses share the same width/skeleton and feel visually balanced.

Expected: all of the above hold. Note: per the deploy convention, also eyeball on the staging interface after pushing (`git push origin main` → prod folder `git pull && npm run build` → `sudo systemctl restart worldbet worldbet-staging`). No DB migration in this change, so `db:migrate` is **not** required.

- [ ] **Step 5: No commit** (verification only). If `npm run build` revealed an issue, fix in the relevant task's file and re-run Steps 1–3.

---

## Notes for the implementer

- **Money/grading untouched.** This change never imports or alters `grade.ts`, `placeBet`/`recordBet`, schema, or accounting. The card only re-arranges existing display data and reuses `onPick` exactly as before.
- **`MarketTiles` market field.** `MatchCard` spreads `{ ...l!, market: "ah" }` / `{ ...ou!, market: "ou" }` so the tile component picks `fav/dog` vs `over/under` sides and labels correctly without duplicating markup.
- **Why no component render test:** the repo has no React Testing Library / DOM harness (vitest covers pure logic + DB via PGlite). The TS build + lint + manual staging eyeball are the gates here, consistent with the project's existing practice for UI.
- **Flag assets are committed**, so production/staging builds need no network and no `flag-icons` at runtime. Re-run `npm run flags:copy` only if the finalist list in `flags.ts` changes.

```

```
