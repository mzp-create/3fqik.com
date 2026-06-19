# Design — Dark Stadium UI/UX Redesign (player-facing)

> **Status:** Approved in brainstorming 2026-06-19. Supersedes the deferred
> `docs/ui-redesign-brief.md` (same intent; direction now decided).
> **Type:** Presentation/UX redesign + small structural additions (hamburger nav,
> Rules page, expandable O/U, empty states, country-name format).
> **Hard constraint:** NO changes to money logic, grading, bet placement, data
> model, or API responses. Same routes and behavior; new skin + nav structure.

## Context

The app works but reads as a flat, light admin tool — "UI is very weak, users
aren't attracted." The owner wants a professional, mobile-app feel inspired by
polymarket.com, in **dark mode**, with the match list denser and the empty
screens friendlier. Brainstorming (with visual mockups) settled the direction
below. Implementation should use the **frontend-design skill** for the visual
execution.

## Decisions (locked)

1. **Theme: "Dark Stadium", dark-only.** Navy/ink surfaces in layered shades,
   the host **triband** (green/red/blue) kept as a glowing accent edge, **Anton**
   display font for prices/scores, functional colors preserved: **green = favourite/over**,
   **blue = underdog/under**, **red = LIVE**, **gold** for brand/balance accents.
   No light theme, no toggle.
2. **Scope: player-facing only.** Admin screens untouched this pass (they stay on
   the current light styling). Light tokens may remain behind the admin layout.
3. **Bottom nav: 3 tabs** — Matches, Bets, Balance. **Hamburger (☰)** in the top
   bar holds non-main items: **Profile/settings, Logout, Rules / how-to-bet,
   Admin link (admins only)**.
4. **Country names:** long name + ISO in brackets everywhere a team is shown —
   `United States (USA)`, `Brazil (BRA)`. (Knockout placeholders with no name fall
   back to the code/label.)
5. **Match board density:** **AH line shown by default; O/U expands on tap** per
   card. Target **≥4 matches visible** on a phone screen.
6. **Empty states (Bets, Balance):** icon circle + Anton headline + one helpful
   sentence + green CTA (approved copy below).

## Token system (`src/app/globals.css`)

Introduce dark surface/border/text tokens in the Tailwind v4 `@theme` block and
flip `body`. Approximate values from the approved mockups (tune during build):

- `--color-canvas: #0d1018` (app background), `--color-surface: #161b27` (cards),
  `--color-surface-2: #11151f` (bars/header/tabs), `--color-raised: #0f1623`
  (inset buttons).
- `--color-border: #232c3d`, `--color-border-2: #1e2533`.
- Text: `--color-ink: #eef1f6` (primary), plus muted steps `#9aa7c0` / `#5d6b85`
  (use `text-ink/70`, `/50`, `/40` style opacities or explicit tokens).
- Accents (keep names): `--color-mx` green, `--color-us` blue, `--color-ca` red,
  `--color-gold`. Add brighter on-dark variants for chips/prices
  (`--color-mx-neon: #34d27f`, `--color-us-neon: #5aa2ff`) so prices pop on dark.
- Keep `.triband` / `.triband-skew` and `.live-dot` pulse (respect
  `prefers-reduced-motion`). Admin layout keeps the old light values (scope it so
  admin isn't dragged dark this pass).

A small token reference: build the **match board first** as the canonical surface,
then propagate tokens to the rest.

## Components & pages in scope

- **`src/app/(player)/layout.tsx`** — dark background; add a **top app bar**
  (brand + ☰ hamburger). A balance pill is **optional** — include it only if a
  current-balance value is readily available app-wide; otherwise omit (Balance has
  its own tab). Houses the new menu drawer.
- **New `src/components/MenuDrawer.tsx`** (or inline in layout) — the ☰ slide-over:
  Profile, Rules, (Admin if `role==='admin'`), Logout. Accessible (focus trap,
  Esc to close, visible focus rings).
- **`src/components/Tabs.tsx`** — restyle bottom nav to 3 tabs (Matches/Bets/Balance);
  move Profile + Admin out of the tab bar into the drawer. Dark surface, triband
  active indicator kept.
- **`src/components/MatchCard.tsx`** — the hero. Dark card, AH two-outcome buttons
  (green fav / blue dog) shown by default; an **expandable O/U** section revealed by
  a per-card toggle (local `useState`, collapsed by default). Long team names via
  the new helper. Preserve suspended/closed/LIVE states and tap targets (≥44px).
- **`src/app/(player)/page.tsx`** — board grouping (By-day / By-group) restyled;
  sticky day headers on dark; denser spacing for ≥4 cards.
- **`src/app/(player)/bet/[matchId]/page.tsx`** — re-skin the dedicated bet page to
  Dark Stadium (outcome picker, stake, If-win/If-lose, "You win if", 2-tap confirm).
  Preserve all behavior and the win-condition helper added earlier.
- **`src/components/TicketCard.tsx`** — dark on-screen ticket. **PNG export draws on
  a white canvas with its own colors — leave the export rendering logic intact**;
  only restyle the on-screen card. Verify the PNG still saves.
- **`src/app/(player)/bets/page.tsx`** — list restyle + new **empty state**.
- **`src/app/(player)/balance/page.tsx`** — restyle + new **empty state**.
- **`src/app/(player)/profile/page.tsx`** — dark restyle (reached from the drawer).
- **Auth pages** `src/app/(auth)/login`, `register`, `RegisterForm`,
  `invite-only`, `InstallBanner` — dark restyle for visual consistency.
- **New `src/app/(player)/rules/page.tsx`** — simple Rules / how-to-bet page
  (handicaps, O/U, Malay prices, the "You win if" idea, push/refund). Static,
  bilingual. Linked from the drawer.
- **`src/lib/client/flags.ts`** — add `teamLabel(code)` →
  `` `${teamName(code)} (${code})` `` (full name + ISO), falling back to the code
  when no full name exists. Replace ad-hoc `flag(code)+code` usages on player
  surfaces with it. (Keep `teamName`/`flag` as-is for other callers.)

## Empty-state copy (EN; Burmese added in build via `useT()`)

- **Bets:** 🎟️ · **"No bets yet"** · "Your tickets show up here once you place a
  bet. Pick a match and tap a price to get started." · CTA **"Browse matches →"** (→ `/`).
- **Balance:** 👛 · **"No activity yet"** · "Your daily wins and losses appear here
  after each match day is settled." · CTA **"See today's matches →"** (→ `/`).

New i18n keys (both `en.ts` + `mm.ts`, parity test enforced): e.g.
`emptyBetsTitle/Body/Cta`, `emptyBalanceTitle/Body/Cta`, `menuProfile`, `menuRules`,
`menuAdmin`, `menuLogout`, `rules*` for the rules page, plus `marketAh`/`marketOu`
labels and a "show O/U" expander label.

## Out of scope

- Admin UI restyle. Light/dark toggle. Any money/grading/data-model/API change.
- New betting features (the two-sided/bet-page/QR work already shipped).

## Constraints

- **Tailwind v4, CSS tokens only** (`@theme` in `globals.css`); no `tailwind.config.js`.
- **Bilingual EN/MM** — comfortable line-height for Burmese; i18n parity test must pass.
- **Mobile-first PWA**, tap targets ≥44px, keep `focus-visible` rings, respect
  `prefers-reduced-motion`, maintain AA contrast on dark for prices/teams.
- **Prettier** auto-runs on edited files.
- **Green bar before done:** `npm run lint`, `npm test` (all current tests), and
  `npm run build` must pass. No test changes expected (presentation only).
- **Deploy:** dev folder → commit → push `origin/main`; production at
  `/mnt/hermes-data/mmzphyo/Worldbet` via `git pull && npm ci && npm run build`,
  then `sudo systemctl restart worldbet worldbet-staging`. Verify on staging
  (`172.26.5.171:3000`) before prod is relied on.
- **Branch:** do the work on `feature/dark-stadium-ui`; open a PR / merge to main
  when approved.

## Verification

1. Lint + test + build green.
2. Manual on staging (dark): board shows ≥4 matches, AH default with O/U expand,
   long names with ISO, LIVE badge, hamburger opens (Profile/Rules/Admin-if-admin/
   Logout), 3 bottom tabs.
3. Bets & Balance empty states render with icon + copy + working CTA.
4. Bet page + ticket dark and fully functional; **PNG ticket export still works**.
5. Contrast/focus/reduced-motion spot-check; Burmese language renders without clipping.
6. Admin pages still load (unchanged, light).
