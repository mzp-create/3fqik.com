# Dark Stadium UI/UX Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Also use** the `frontend-design` skill for the visual execution of every restyle task (palette, spacing, hierarchy). The approved mockups live in `.superpowers/brainstorm/2350475-1781876285/content/` (`board-directions.html` = A·Dark Stadium, `density.html` = option 2, `empty-states.html`).

**Goal:** Re-skin the player-facing app into a dark, mobile-app "Dark Stadium" look (Polymarket-influenced) with a hamburger drawer, denser match board, friendlier empty states, and `Full Name (ISO)` team labels — with zero changes to money logic, grading, data model, or API.

**Architecture:** Tailwind v4 `@theme` tokens in `globals.css` flip the app to a dark surface system; the match board (`MatchCard`) is built first as the canonical surface, then tokens/patterns propagate to the rest. Nav restructures to 3 bottom tabs + a `☰` drawer for non-main items. All behavior (bet placement, grading, SSE, win-condition, PNG export) is preserved — only presentation and nav structure change.

**Tech Stack:** Next.js 16 (App Router, Turbopack), TypeScript, Tailwind v4 (CSS tokens, no config file), Drizzle/Postgres (untouched), vitest, i18n via `useT()` (`en.ts`/`mm.ts`, parity test).

**Branch:** `feature/dark-stadium-ui` (already created, spec committed at `58ecc1e`). All task commits land here.

**Scope:** Player-facing only. Admin screens stay light/untouched this pass.

---

## File Structure

**Create:**

- `src/components/MenuDrawer.tsx` — the `☰` slide-over (Profile, Rules, Admin-if-admin, Logout).
- `src/components/AppBar.tsx` — top bar (brand + `☰`), used by the player layout.
- `src/components/EmptyState.tsx` — reusable icon + title + body + CTA block.
- `src/app/(player)/rules/page.tsx` — Rules / how-to-bet page.

**Modify:**

- `src/app/globals.css` — dark `@theme` tokens + keep triband/live-dot; scope admin to light.
- `src/lib/client/flags.ts` — add `teamLabel(code)`.
- `src/lib/i18n/en.ts` + `src/lib/i18n/mm.ts` — new keys (drawer, empty states, rules, market labels, O/U expander).
- `src/app/(player)/layout.tsx` — dark bg, mount `<AppBar>` + `<MenuDrawer>`.
- `src/components/Tabs.tsx` — 3 tabs, dark; remove Profile/Admin (moved to drawer).
- `src/components/MatchCard.tsx` — dark card, AH default + expandable O/U, `teamLabel`.
- `src/app/(player)/page.tsx` — dark board, denser, sticky headers; uses `teamLabel`.
- `src/app/(player)/bet/[matchId]/page.tsx` — dark restyle (behavior preserved).
- `src/components/TicketCard.tsx` — dark on-screen card; **leave PNG canvas logic intact**.
- `src/app/(player)/bets/page.tsx` — dark list + `<EmptyState>`.
- `src/app/(player)/balance/page.tsx` — dark + `<EmptyState>`.
- `src/app/(player)/profile/page.tsx` — dark restyle.
- `src/app/(auth)/login/page.tsx`, `src/app/(auth)/register/page.tsx`, `src/components/RegisterForm.tsx`, `src/app/invite-only/page.tsx`, `src/components/InstallBanner.tsx` — dark restyle.

**Test:**

- `src/lib/client/teamLabel.test.ts` — unit test for the new helper.
- Existing `src/lib/i18n/i18n.test.ts` enforces EN/MM key parity (must stay green).

> **Testing note:** This is a presentation redesign — the project has no React component-test harness, and money logic is untouched. So only the pure helper (`teamLabel`) and i18n parity get unit tests. Every visual task is verified by `npm run lint && npm run build` staying green plus a manual dark-mode eyeball on staging (`172.26.5.171:3000`). Do **not** add a component-test framework.

---

## Task 1: Dark token system in `globals.css`

**Files:**

- Modify: `src/app/globals.css`

- [ ] **Step 1: Replace the `@theme` block + body with dark tokens; keep triband/live-dot.**

```css
@import "tailwindcss";

@theme {
  /* Dark Stadium surfaces (layered shades) */
  --color-canvas: #0d1018; /* app background */
  --color-surface: #161b27; /* cards */
  --color-surface-2: #11151f; /* bars: header, tabs */
  --color-raised: #0f1623; /* inset buttons */
  --color-border: #232c3d;
  --color-border-2: #1e2533;

  /* Text */
  --color-ink: #eef1f6; /* primary on dark */
  --color-muted: #9aa7c0;
  --color-faint: #5d6b85;

  /* Functional accents (names preserved from old theme) */
  --color-mx: #007a33; /* favourite / over (base) */
  --color-us: #0a3a82; /* underdog / under (base) */
  --color-ca: #e03c31; /* LIVE / loss */
  --color-gold: #f5b335; /* brand / balance */
  --color-mx-neon: #34d27f; /* price text on dark — fav/over */
  --color-us-neon: #5aa2ff; /* price text on dark — dog/under */

  --font-display: var(--font-anton), sans-serif;
  --font-sans: var(--font-geist-sans), sans-serif;
  --font-mono: var(--font-geist-mono), monospace;
}

body {
  background-color: var(--color-canvas);
  color: var(--color-ink);
}

/* Admin stays on the old light look this pass. Wrap admin layout root in
   `.admin-light` and restore light surfaces under it. */
.admin-light {
  background-color: #fafaf7;
  color: #14161b;
}

/* Triband + live-dot unchanged (identity) */
.triband {
  height: 5px;
  background: linear-gradient(
    to right,
    #007a33 0% 33.33%,
    #e03c31 33.33% 66.66%,
    #0a3a82 66.66% 100%
  );
}
.triband-skew {
  height: 5px;
  background: linear-gradient(
    to right,
    #007a33 0% 33.33%,
    #e03c31 33.33% 66.66%,
    #0a3a82 66.66% 100%
  );
  transform: skewX(-12deg);
}
@media (prefers-reduced-motion: no-preference) {
  .live-dot {
    animation: pulse 1.4s ease-in-out infinite;
  }
}
@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.3;
  }
}
```

- [ ] **Step 2: Add `.admin-light` to the admin layout root** so admin keeps light styling.

In `src/app/admin/layout.tsx`, add `className="admin-light"` to its outermost wrapping element (read the file; wrap the existing root `<div>`/fragment in a `<div className="admin-light min-h-screen">`). Admin children still use literal Tailwind grays, so they remain readable on the light wrapper.

- [ ] **Step 3: Verify build + lint.**

Run: `npm run build && npm run lint`
Expected: build compiles, lint clean. (App will look dark; admin light.)

- [ ] **Step 4: Commit.**

```bash
git add src/app/globals.css src/app/admin/layout.tsx
git commit -m "feat(ui): dark Stadium token system; scope admin to light"
```

---

## Task 2: `teamLabel()` helper + unit test

**Files:**

- Modify: `src/lib/client/flags.ts`
- Test: `src/lib/client/teamLabel.test.ts`

- [ ] **Step 1: Write the failing test.**

```typescript
// src/lib/client/teamLabel.test.ts
import { it, expect } from "vitest";
import { teamLabel } from "./flags";

it("formats a known team as 'Full Name (ISO)'", () => {
  expect(teamLabel("USA")).toBe("United States (USA)");
  expect(teamLabel("BRA")).toBe("Brazil (BRA)");
});

it("falls back to the code/label when no full name exists", () => {
  // Knockout placeholders have no FIFA name → show the raw label.
  expect(teamLabel("Winner A")).toBe("Winner A");
  expect(teamLabel("ZZZ")).toBe("ZZZ");
});
```

- [ ] **Step 2: Run it; verify it fails.**

Run: `npx vitest run src/lib/client/teamLabel.test.ts`
Expected: FAIL — `teamLabel` is not exported.

- [ ] **Step 3: Implement `teamLabel` in `flags.ts`** (just below `teamName`):

```typescript
/** "United States (USA)" for known teams; the raw code/label otherwise
 *  (knockout placeholders like "Winner A" have no FIFA name). */
export function teamLabel(code: string): string {
  const full = FIFA_NAME[code];
  return full ? `${full} (${code})` : code;
}
```

- [ ] **Step 4: Run the test; verify it passes.**

Run: `npx vitest run src/lib/client/teamLabel.test.ts`
Expected: PASS (both tests).

- [ ] **Step 5: Commit.**

```bash
git add src/lib/client/flags.ts src/lib/client/teamLabel.test.ts
git commit -m "feat(ui): teamLabel() -> 'Full Name (ISO)' with code fallback"
```

---

## Task 3: i18n keys for nav, empty states, rules, markets

**Files:**

- Modify: `src/lib/i18n/en.ts`, `src/lib/i18n/mm.ts`
- Test: `src/lib/i18n/i18n.test.ts` (existing parity test)

- [ ] **Step 1: Add these keys to `en.ts`** (inside the `en` object):

```typescript
  // drawer / nav
  menuProfile: "Profile & settings",
  menuRules: "How to bet",
  menuAdmin: "Admin",
  menuLogout: "Log out",
  closeMenu: "Close",
  // markets / board
  marketAh: "Handicap",
  marketOu: "Over / Under",
  showOu: "Show Over / Under",
  hideOu: "Hide Over / Under",
  // empty states
  emptyBetsTitle: "No bets yet",
  emptyBetsBody: "Your tickets show up here once you place a bet. Pick a match and tap a price to get started.",
  emptyBetsCta: "Browse matches",
  emptyBalanceTitle: "No activity yet",
  emptyBalanceBody: "Your daily wins and losses appear here after each match day is settled.",
  emptyBalanceCta: "See today's matches",
  // rules page
  rulesTitle: "How to bet",
  rulesAhTitle: "Asian handicap",
  rulesAhBody: "A team starts with a goal head-start or deficit (e.g. −1). Your pick wins if it clears the handicap.",
  rulesOuTitle: "Over / Under",
  rulesOuBody: "Bet whether total goals are over or under a line (e.g. 2.5).",
  rulesPriceTitle: "Prices & payouts",
  rulesPriceBody: "Prices are Malay odds. A positive price pays a fraction of your stake on a win; a negative price risks a fraction to win your full stake.",
  rulesPushTitle: "Refunds (push)",
  rulesPushBody: "On a whole-number line, an exact result returns your stake.",
```

- [ ] **Step 2: Add the SAME keys to `mm.ts`** with Burmese values (machine-draft acceptable per the file's existing convention; keep line-height-friendly text):

```typescript
  menuProfile: "ပရိုဖိုင်နှင့် ဆက်တင်",
  menuRules: "လောင်းနည်း",
  menuAdmin: "အက်ဒမင်",
  menuLogout: "ထွက်မည်",
  closeMenu: "ပိတ်မည်",
  marketAh: "ဟန်ဒီကပ်",
  marketOu: "ဂိုးပေါင်း",
  showOu: "ဂိုးပေါင်း ပြရန်",
  hideOu: "ဂိုးပေါင်း ဖျောက်ရန်",
  emptyBetsTitle: "လောင်းကြေး မရှိသေးပါ",
  emptyBetsBody: "လောင်းပြီးသည်နှင့် သင့်လက်မှတ်များ ဤနေရာတွင် ပေါ်လာပါမည်။ ပွဲတစ်ပွဲရွေး၍ စျေးနှုန်းကို နှိပ်ပါ။",
  emptyBetsCta: "ပွဲများ ကြည့်ရန်",
  emptyBalanceTitle: "လှုပ်ရှားမှု မရှိသေးပါ",
  emptyBalanceBody: "ပွဲနေ့ပြီးဆုံးပြီးနောက် သင့်နေ့စဉ် အနိုင်အရှုံးများ ဤနေရာတွင် ပေါ်လာပါမည်။",
  emptyBalanceCta: "ယနေ့ပွဲများ ကြည့်ရန်",
  rulesTitle: "လောင်းနည်း",
  rulesAhTitle: "အာရှ ဟန်ဒီကပ်",
  rulesAhBody: "အသင်းတစ်သင်းသည် ဂိုးအသာ/အလို (ဥပမာ −၁) ဖြင့် စတင်သည်။ ဟန်ဒီကပ်ကို ကျော်လွန်ပါက သင်ရွေးချယ်မှု အနိုင်ရသည်။",
  rulesOuTitle: "ဂိုးပေါင်း",
  rulesOuBody: "စုစုပေါင်းဂိုး သတ်မှတ်လိုင်း (ဥပမာ ၂.၅) ထက် ကျော်/မကျော် လောင်းခြင်း။",
  rulesPriceTitle: "စျေးနှုန်းနှင့် ပြန်အမ်းငွေ",
  rulesPriceBody: "စျေးနှုန်းများသည် Malay odds ဖြစ်သည်။ အပေါင်းစျေးက အနိုင်ရလျှင် လောင်းကြေး၏ အစိတ်အပိုင်းကို ပေးသည်။ အနုတ်စျေးက အစိတ်အပိုင်းကို စွန့်စား၍ လောင်းကြေးအပြည့်ကို အနိုင်ရသည်။",
  rulesPushTitle: "ပြန်အမ်းငွေ",
  rulesPushBody: "ကိန်းပြည့်လိုင်းတွင် တိကျသောရလဒ်သည် သင့်လောင်းကြေးကို ပြန်အမ်းသည်။",
```

- [ ] **Step 3: Run the parity test.**

Run: `npx vitest run src/lib/i18n/i18n.test.ts`
Expected: PASS (mm has every en key).

- [ ] **Step 4: Commit.**

```bash
git add src/lib/i18n/en.ts src/lib/i18n/mm.ts
git commit -m "feat(ui): i18n keys for drawer, empty states, rules, markets"
```

---

## Task 4: `MatchCard` — dark + AH default + expandable O/U + `teamLabel`

**Files:**

- Modify: `src/components/MatchCard.tsx`

The card is the canonical dark surface — build it carefully with the frontend-design skill, matching `board-directions.html` (A) + `density.html` (option 2).

- [ ] **Step 1: Add the O/U expand state + `teamLabel`.** At the top of the `MatchCard` component body add:

```tsx
const [showOu, setShowOu] = useState(false);
```

Import `useState` from `react` and `teamLabel` from `@/lib/client/flags` (replace the local `teamLabel` helper currently defined in this file — delete the old in-file `teamLabel` and `flag`-only usage, use the shared one). Keep `flag()` import if still used elsewhere in the card.

- [ ] **Step 2: Restyle the card shell + teams to dark.** Replace the outer card classes and team line:
  - Card: `mb-3 rounded-xl border border-border bg-surface p-4 shadow-sm` (was `border-ink/10 bg-white`).
  - Eyebrow stage/kickoff: `text-faint`; LIVE badge keeps `bg-ca text-white` + `.live-dot`.
  - Teams line: use `teamLabel(m.homeTeam)` / `teamLabel(m.awayTeam)` with `flag()` prefix, `text-ink`.

- [ ] **Step 3: AH buttons shown by default (dark), O/U behind a toggle.** Keep the existing two-tile AH structure (fav green / dog blue) but recolor for dark: tiles `bg-raised border-2`, fav rail `bg-mx` + price `text-mx-neon`, dog rail `bg-us` + price `text-us-neon`. Then replace the always-on O/U block with a toggle + collapsible:

```tsx
{
  ou && ou.status !== "closed" && (
    <div className="mt-2">
      <button
        onClick={() => setShowOu((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg px-1 py-1.5 text-sm font-semibold text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
      >
        <span>
          {t.marketOu} {ou.status === "suspended" ? "" : ball(ou.ballQ)}
        </span>
        <span>{showOu ? `${t.hideOu} ⌃` : `${t.showOu} ⌄`}</span>
      </button>
      {showOu && (
        <div className="mt-1">
          {/* existing O/U two-tile block, recolored for dark exactly like AH */}
        </div>
      )}
    </div>
  );
}
```

Preserve the suspended (`⏸ {t.suspended}`) and closed handling for both markets. Keep `onPick("ou","over"|"under")` wiring and the `priceOppC != null` guard for the dog/under tile.

- [ ] **Step 4: Verify build + lint.**

Run: `npm run build && npm run lint`
Expected: clean. Card renders dark; O/U hidden until tapped.

- [ ] **Step 5: Commit.**

```bash
git add src/components/MatchCard.tsx
git commit -m "feat(ui): dark MatchCard, AH default + expandable O/U, Full Name (ISO)"
```

---

## Task 5: Match board page (`(player)/page.tsx`) — dark + density

**Files:**

- Modify: `src/app/(player)/page.tsx`

- [ ] **Step 1: Restyle to dark + denser.**
  - View toggle (`byDay`/`byGroup`): container `bg-surface-2`, active pill `bg-surface text-ink`, inactive `text-faint`.
  - Sticky day headers: `bg-canvas/95 backdrop-blur`, heading `text-ink`, keep `DayTag` but recolor (`bg-mx/15 text-mx-neon` for Today, `bg-ca/15 text-ca` for Overdue, `bg-surface text-muted` otherwise).
  - By-group `ResultRow` + team chips: dark surfaces (`bg-surface`, borders `border-border`), `teamLabel()` for names.
  - Reduce vertical rhythm (`mb-3`→`mb-2` between cards, tighter section margins) to help ≥4 cards fit.
  - Replace `teamName`/code displays with `teamLabel` where a team is named.

- [ ] **Step 2: Verify build + lint.**

Run: `npm run build && npm run lint`
Expected: clean.

- [ ] **Step 3: Commit.**

```bash
git add "src/app/(player)/page.tsx"
git commit -m "feat(ui): dark match board, denser layout, Full Name (ISO)"
```

---

## Task 6: `EmptyState` component + wire into Bets & Balance

**Files:**

- Create: `src/components/EmptyState.tsx`
- Modify: `src/app/(player)/bets/page.tsx`, `src/app/(player)/balance/page.tsx`

- [ ] **Step 1: Create `EmptyState.tsx`.**

```tsx
import Link from "next/link";

export function EmptyState({
  icon,
  title,
  body,
  ctaLabel,
  ctaHref,
}: {
  icon: string;
  title: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-8 py-16 text-center">
      <div className="mb-4 flex h-[74px] w-[74px] items-center justify-center rounded-full border border-border bg-raised text-[34px]">
        {icon}
      </div>
      <h2 className="font-display text-2xl text-ink">{title}</h2>
      <p className="mt-2 max-w-[240px] text-sm leading-relaxed text-muted">
        {body}
      </p>
      <Link
        href={ctaHref}
        className="mt-5 rounded-xl border border-mx bg-mx/90 px-5 py-3 text-sm font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
      >
        {ctaLabel} →
      </Link>
    </div>
  );
}
```

- [ ] **Step 2: Use it in `bets/page.tsx`.** Replace the `{t.noBets}` paragraph (the empty branch) with:

```tsx
<EmptyState
  icon="🎟️"
  title={t.emptyBetsTitle}
  body={t.emptyBetsBody}
  ctaLabel={t.emptyBetsCta}
  ctaHref="/"
/>
```

Import `EmptyState` from `@/components/EmptyState`. Restyle the surrounding list/cards + ticket modal to dark (`bg-surface`, `border-border`, `text-ink/muted`).

- [ ] **Step 3: Use it in `balance/page.tsx`.** Replace the `{t.noDays}` empty paragraph with:

```tsx
<EmptyState
  icon="👛"
  title={t.emptyBalanceTitle}
  body={t.emptyBalanceBody}
  ctaLabel={t.emptyBalanceCta}
  ctaHref="/"
/>
```

Restyle the balance day list to dark surfaces.

- [ ] **Step 4: Verify build + lint.**

Run: `npm run build && npm run lint`
Expected: clean.

- [ ] **Step 5: Commit.**

```bash
git add src/components/EmptyState.tsx "src/app/(player)/bets/page.tsx" "src/app/(player)/balance/page.tsx"
git commit -m "feat(ui): friendly empty states for Bets & Balance; dark lists"
```

---

## Task 7: AppBar + MenuDrawer (hamburger) + layout

**Files:**

- Create: `src/components/AppBar.tsx`, `src/components/MenuDrawer.tsx`
- Modify: `src/app/(player)/layout.tsx`

The layout is a server component (reads `currentPlayer()`); AppBar/MenuDrawer are client components. Pass `isAdmin` + display name down as props.

- [ ] **Step 1: Create `MenuDrawer.tsx`** (client, accessible slide-over):

```tsx
"use client";
import Link from "next/link";
import { useEffect } from "react";
import { useT } from "@/lib/i18n";

export function MenuDrawer({
  open,
  onClose,
  isAdmin,
  name,
}: {
  open: boolean;
  onClose: () => void;
  isAdmin: boolean;
  name: string;
}) {
  const { t } = useT();
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  const item =
    "block rounded-lg px-3 py-3 text-base font-semibold text-ink hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us";
  return (
    <div className="fixed inset-0 z-30 bg-ink/60" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-72 max-w-[80%] bg-surface-2 p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-4 flex items-center justify-between">
          <span className="font-display text-lg text-ink">{name}</span>
          <button
            onClick={onClose}
            aria-label={t.closeMenu}
            className="text-muted"
          >
            ✕
          </button>
        </div>
        <nav className="space-y-1">
          <Link href="/profile" className={item} onClick={onClose}>
            {t.menuProfile}
          </Link>
          <Link href="/rules" className={item} onClick={onClose}>
            {t.menuRules}
          </Link>
          {isAdmin && (
            <Link href="/admin" className={item} onClick={onClose}>
              {t.menuAdmin}
            </Link>
          )}
          <a href="/api/auth/logout" className={item}>
            {t.menuLogout}
          </a>
        </nav>
        <div className="triband mt-6" />
      </div>
    </div>
  );
}
```

> Verify the logout route: check how the current Profile page logs out (search `grep -rn "logout" src/app/api src/app/(player)/profile`). Use the same mechanism — if logout is a POST or a client action, replace the `<a href>` with that exact call rather than a GET link.

- [ ] **Step 2: Create `AppBar.tsx`** (client; owns the open state):

```tsx
"use client";
import { useState } from "react";
import { MenuDrawer } from "./MenuDrawer";

export function AppBar({ isAdmin, name }: { isAdmin: boolean; name: string }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-20 mx-auto flex max-w-md items-center gap-3 border-b border-border-2 bg-surface-2 px-4 py-3">
      <button
        onClick={() => setOpen(true)}
        aria-label="Menu"
        className="text-xl text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
      >
        ☰
      </button>
      <span className="font-display text-lg tracking-wide text-ink">
        WORLD<span className="text-gold">BET</span>
      </span>
      <MenuDrawer
        open={open}
        onClose={() => setOpen(false)}
        isAdmin={isAdmin}
        name={name}
      />
    </header>
  );
}
```

- [ ] **Step 3: Mount in `(player)/layout.tsx`.** Add `<AppBar isAdmin={me.role === "admin"} name={me.displayName} />` just inside the `max-w-md` wrapper, above `{children}`. Keep `<Tabs>` and `<InstallBanner>`. (The layout already has `me`.)

- [ ] **Step 4: Verify build + lint, and confirm logout works.**

Run: `npm run build && npm run lint`
Expected: clean. Manually: drawer opens/closes (✕, Esc, backdrop), links navigate, logout signs out.

- [ ] **Step 5: Commit.**

```bash
git add src/components/AppBar.tsx src/components/MenuDrawer.tsx "src/app/(player)/layout.tsx"
git commit -m "feat(ui): top AppBar + hamburger MenuDrawer (Profile/Rules/Admin/Logout)"
```

---

## Task 8: `Tabs` — 3 dark tabs (drop Profile/Admin)

**Files:**

- Modify: `src/components/Tabs.tsx`

- [ ] **Step 1: Reduce to 3 tabs + dark.** Remove the `/profile` and `/admin` entries (now in the drawer) and the `isAdmin` prop usage for tabs. Recolor: nav `border-border bg-surface-2`, active `text-ink` with the `.triband` indicator, inactive `text-faint`.

```tsx
const tabs = [
  { href: "/", label: t.tabMatches },
  { href: "/bets", label: t.tabBets },
  { href: "/balance", label: t.tabBalance },
];
```

Keep the `isAdmin` prop in the signature (layout still passes it) but it's now unused — or drop it from both the component and the layout call. Pick one and keep them consistent.

- [ ] **Step 2: Verify build + lint.**

Run: `npm run build && npm run lint`
Expected: clean. Bottom nav shows exactly 3 dark tabs.

- [ ] **Step 3: Commit.**

```bash
git add src/components/Tabs.tsx "src/app/(player)/layout.tsx"
git commit -m "feat(ui): 3-tab dark bottom nav; profile/admin moved to drawer"
```

---

## Task 9: Bet page dark restyle

**Files:**

- Modify: `src/app/(player)/bet/[matchId]/page.tsx`

- [ ] **Step 1: Recolor to dark, preserve all behavior.** Map current classes to tokens: page stays in the `max-w-md` layout; match header `bg-surface`; the two outcome buttons → dark tiles like MatchCard (selected `border-ink bg-raised`, fav `text-mx-neon`, dog `text-us-neon`); stake input `bg-raised border-border text-ink`; chips `border-border text-ink`; If-win `text-mx-neon`, If-lose `text-ca`; the "✓ You win if" banner `border-mx/30 bg-mx/10`; confirm button keeps `bg-mx` → `bg-ca` armed. Use `teamLabel` in the outcome labels. **Do not touch** the data fetch, SSE, line-move handling, `preview()`, `winNeed()`, or the 2-tap confirm logic.

- [ ] **Step 2: Verify build + lint.**

Run: `npm run build && npm run lint`
Expected: clean.

- [ ] **Step 3: Commit.**

```bash
git add "src/app/(player)/bet/[matchId]/page.tsx"
git commit -m "feat(ui): dark bet page (behavior unchanged)"
```

---

## Task 10: TicketCard dark (on-screen only; preserve PNG export)

**Files:**

- Modify: `src/components/TicketCard.tsx`

- [ ] **Step 1: Restyle the on-screen ticket to dark.** Card `bg-surface border-border`; ticketNo `text-ink`; rows `text-muted`/`text-ink`; stamp colors keep mx/ca. **Leave the `save()` canvas function exactly as-is** — it draws on a white canvas with explicit colors for the PNG; do not re-theme it. The Save button can go dark (`bg-ink` → use `bg-raised border border-border text-ink`).

- [ ] **Step 2: Verify build + lint, then verify PNG still exports.**

Run: `npm run build && npm run lint`
Expected: clean. Manually open a ticket and click Save — the downloaded PNG must still render correctly (white ticket, all rows).

- [ ] **Step 3: Commit.**

```bash
git add src/components/TicketCard.tsx
git commit -m "feat(ui): dark on-screen ticket (PNG export untouched)"
```

---

## Task 11: Profile, auth pages, install banner — dark restyle

**Files:**

- Modify: `src/app/(player)/profile/page.tsx`, `src/app/(auth)/login/page.tsx`, `src/app/(auth)/register/page.tsx`, `src/components/RegisterForm.tsx`, `src/app/invite-only/page.tsx`, `src/components/InstallBanner.tsx`

- [ ] **Step 1: Recolor each to dark tokens.** Inputs `bg-raised border-border text-ink placeholder:text-faint`; cards `bg-surface border-border`; headings `text-ink`; secondary text `text-muted`; primary buttons `bg-mx text-white`. Keep all form logic, language toggle, PIN-change flow, and validation untouched — presentation only.

- [ ] **Step 2: Verify build + lint.**

Run: `npm run build && npm run lint`
Expected: clean.

- [ ] **Step 3: Commit.**

```bash
git add "src/app/(player)/profile/page.tsx" "src/app/(auth)/login/page.tsx" "src/app/(auth)/register/page.tsx" src/components/RegisterForm.tsx src/app/invite-only/page.tsx src/components/InstallBanner.tsx
git commit -m "feat(ui): dark profile, auth pages, install banner"
```

---

## Task 12: Rules / how-to-bet page

**Files:**

- Create: `src/app/(player)/rules/page.tsx`

- [ ] **Step 1: Create the page** (client component for `useT()`):

```tsx
"use client";
import { useT } from "@/lib/i18n";

export default function RulesPage() {
  const { t } = useT();
  const sections = [
    { title: t.rulesAhTitle, body: t.rulesAhBody },
    { title: t.rulesOuTitle, body: t.rulesOuBody },
    { title: t.rulesPriceTitle, body: t.rulesPriceBody },
    { title: t.rulesPushTitle, body: t.rulesPushBody },
  ];
  return (
    <main className="p-4">
      <h1 className="font-display text-2xl text-ink">{t.rulesTitle}</h1>
      <div className="mt-4 space-y-3">
        {sections.map((s) => (
          <section
            key={s.title}
            className="rounded-xl border border-border bg-surface p-4"
          >
            <h2 className="text-base font-bold text-ink">{s.title}</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted">{s.body}</p>
          </section>
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Verify build + lint, confirm drawer link works.**

Run: `npm run build && npm run lint`
Expected: clean. Drawer → "How to bet" → renders the page in both EN and MM.

- [ ] **Step 3: Commit.**

```bash
git add "src/app/(player)/rules/page.tsx"
git commit -m "feat(ui): Rules / how-to-bet page"
```

---

## Task 13: Full verification + deploy

**Files:** none (verification).

- [ ] **Step 1: Full gate.**

Run: `npm run lint && npm test && npm run build`
Expected: lint clean, all existing tests + the new `teamLabel` test pass, build green.

- [ ] **Step 2: Manual dark eyeball on staging.** Push the branch, deploy to staging, and walk through: board (≥4 matches, AH default, O/U expands, `Full Name (ISO)`, LIVE), hamburger (Profile/Rules/Admin-if-admin/Logout), 3 tabs, Bets & Balance empty states + CTAs, bet page place flow, ticket + **PNG export**, profile/auth, EN↔MM toggle (no clipping), admin still light/working, focus rings + reduced-motion.

```bash
# from dev folder, on feature branch:
git push -u origin feature/dark-stadium-ui
# open PR; after review, merge to main, then on production:
cd /mnt/hermes-data/mmzphyo/Worldbet && git pull && npm ci && npm run build && \
  sudo systemctl restart worldbet worldbet-staging
```

- [ ] **Step 3: Final commit / PR** (if any fixups from the eyeball).

```bash
git add -A && git commit -m "fix(ui): polish from staging review"
```

---

## Notes for the implementer

- Use the **frontend-design skill** for the visual judgment in Tasks 4–12; the approved mockups in `.superpowers/brainstorm/2350475-1781876285/content/` are the reference for palette, spacing, and hierarchy.
- Keep tap targets ≥44px, `focus-visible` rings, and `prefers-reduced-motion` (already in `.live-dot`).
- Money/grading/API/data model are **out of bounds** — if a task seems to require touching them, stop and re-read the spec.
