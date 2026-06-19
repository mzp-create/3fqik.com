# UI Redesign Brief — "Card Mode / Strong Sportsbook Look"

> **Status:** Requested 2026-06-19, deferred to a future session. Nothing built yet.
> **Owner ask (verbatim):** "i want to change the over-all site to card mode - more
> strong sport betting looks. UI is very weak - user are not attract to current look."

## Goal

Restyle WorldBet2026 from its current flat, light, low-contrast look into a bold,
immersive, **card-based sportsbook aesthetic** that feels exciting and draws players in.
This is a **visual/CSS redesign only** — no changes to money logic, grading, bet flow,
data model, or API. Same components and routes; new skin.

## Current design system (as of this brief)

Defined in `src/app/globals.css` via Tailwind v4 `@theme`:

- **Canvas:** `--color-canvas: #fafaf7` (near-white, light)
- **Ink:** `--color-ink: #14161b`
- **Host-nation accents (the ownable identity):**
  - `--color-mx: #007a33` (Mexico green) — used for favourite / over
  - `--color-ca: #e03c31` (Canada red) — used for LIVE
  - `--color-us: #0a3a82` (USA blue) — used for underdog / under
  - `--color-gold: #f5b335`
- **Fonts:** `--font-display: Anton` (condensed, used for big prices/scores),
  `--font-sans: Geist Sans`, `--font-mono: Geist Mono`
- **Signature elements:** `.triband` / `.triband-skew` (5px green|red|blue stripe),
  `.live-dot` pulse animation (respects `prefers-reduced-motion`)

**Why it reads as "weak":** light background + thin `border-ink/10` cards + `shadow-sm`

- lots of `text-ink/40` muted text = no depth, no contrast, no energy. Prices don't pop.
  Looks like a clean admin tool, not a sportsbook.

**What to keep (don't throw away the identity):** the host triband (green/red/blue),
the Anton display font for prices/scores, the functional color mapping
(green = favourite/over, blue = underdog/under, red = live), the `.live-dot` pulse.
The redesign should **amplify** these, not replace them.

## Direction decision (UNRESOLVED — ask owner first)

The owner was about to be asked these two questions (via AskUserQuestion) but chose to
defer. **A future session must get these answers before building.**

### Q1 — Theme (pick one)

1. **Dark Stadium (recommended).** Dark navy/black canvas, white teams, neon green/blue
   price chips, red LIVE, host triband as a glowing edge. Classic modern-sportsbook feel
   (DraftKings / Stake energy). Highest contrast, prices pop the most.
   ```
   ┌──────────────────────────────┐
   │ GROUP A · 21:00        ● LIVE │  ← dark navy card
   │  🇲🇽 MEX    vs    🇿🇦 RSA      │  ← white bold teams
   │ ──────────────────────────── │
   │ ▌ MEX  −1.0        ┌────────┐ │
   │ ▌ favourite        │ +0.80  │ │  ← neon-green chip, huge Anton number
   │                    └────────┘ │
   └──────────────────────────────┘
     ▀▀▀▀▀ green │ red │ blue glow
   ```
2. **Charcoal + Gold.** Near-black charcoal, restrained gold accents/prices. Premium /
   VIP betting-lounge feel. Understated, classy.
3. **Bold Light.** Keep light background but loud: thick black borders, oversized type,
   solid color blocks. Brightest, most readable, least change from today.

### Q2 — Scope of first pass (pick one)

1. **Player-facing first (recommended):** home/match board, bet slip, balance, my bets,
   ticket. Admin untouched this pass. Biggest payoff, fastest to review.
2. **Whole site:** player + all admin pages. Most consistent, larger change.
3. **Match board + bet slip only:** smallest, proves the look before committing.

## Files in scope

**Design tokens / global (touch first):**

- `src/app/globals.css` — the `@theme` block + signature CSS. The whole redesign pivots
  here. If going dark: introduce dark surface tokens (e.g. `--color-canvas`, a raised
  `--color-surface`, `--color-surface-2`, borders, glows) and flip `body`. Consider
  keeping light tokens behind a class if admin stays light in pass 1.
- `src/app/layout.tsx`, `src/app/(player)/layout.tsx`, `src/app/admin/layout.tsx` —
  background, nav/tab chrome.
- `src/components/Tabs.tsx` — bottom/section nav styling.

**Player-facing components & pages:**

- `src/components/MatchCard.tsx` — THE hero surface. Currently white card, left color
  rail, Anton price. This is where the new card language is defined. (Read it first.)
- `src/components/BetSlip.tsx` — recently redesigned for safety (two-tap confirm, plain
  MMK preview). Re-skin to match; **preserve all the safety affordances**.
- `src/components/TicketCard.tsx` — HTML + PNG export; restyle carefully (PNG export uses
  inline styles / canvas — verify export still renders).
- `src/app/(player)/page.tsx` — match board (By-day / By-group grouping, sticky headers).
- `src/app/(player)/balance/page.tsx`, `src/app/(player)/bets/page.tsx`,
  `src/app/(player)/profile/page.tsx`.
- `src/app/t/[ticketNo]/page.tsx` — public QR verify page (English-only, server comp).
- `src/app/(auth)/login/page.tsx`, `src/app/(auth)/register/page.tsx`,
  `src/components/RegisterForm.tsx`, `src/app/invite-only/page.tsx`,
  `src/components/InstallBanner.tsx`.

**Admin (only if "Whole site" chosen):**

- `src/app/admin/{page,scores,lines,bets,settle,reports,players,audit,settings}/page.tsx`
- `src/components/admin/LineGrid.tsx`

## Constraints & gotchas

- **Tailwind v4, CSS-configured.** No `tailwind.config.js`. All tokens live in
  `globals.css` `@theme`. Add new color tokens there; reference as `bg-surface`, etc.
- **Bilingual EN/MM** — Burmese text needs comfortable line-height; don't set type so
  tight it clips Burmese. i18n via `useT()` / `src/lib/i18n/{en,mm}.ts`.
- **Mobile-first PWA.** Players are on phones. Design for small screens; tap targets
  ≥44px (MatchCard tiles already use `minHeight: 72px`).
- **Accessibility floor:** keep visible focus rings (`focus-visible:ring-*`), respect
  `prefers-reduced-motion` (already done for `.live-dot`), maintain contrast — dark theme
  must keep AA contrast for prices/teams.
- **Prettier auto-runs** on edited files (PostToolUse hook).
- **No money/logic edits.** Pure presentation. `npm test` must stay green (197 tests);
  `npx tsc --noEmit` + `npm run lint` clean; `npm run build`.
- **Deploy:** prod + staging SHARE ONE BUILD. `npm run build` then
  `sudo systemctl restart worldbet worldbet-staging`. Staging public at
  `http://54.254.137.151:3000`, prod at `https://3fqik.com`. Verify on staging first.
- Work on a feature branch (e.g. `feature/ui-card-redesign`); offer to merge to `main`.

## Suggested execution (for the future session)

1. Ask Q1 + Q2 (above) — get the theme + scope locked before any code.
2. Establish the token system in `globals.css` first (surfaces, borders, glows, accent
   chips). Get one screen (the match board) looking right as a reference.
3. Redesign `MatchCard.tsx` to set the card language, then propagate to BetSlip, then the
   rest of the chosen scope.
4. Keep the host triband + Anton + functional color mapping as the through-line.
5. Verify: tsc / lint / test / build → restart → eyeball staging → merge.

Consider running the `frontend-design` skill for the visual direction work.
