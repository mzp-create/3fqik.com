# Design — Onboarding Gate: install + language before auth (Feature B)

> **Status:** Autonomous design 2026-06-19 (user delegated B with no further input).
> **Scope:** Feature B of three. Presentation/flow only — no money/auth-logic changes.

## Context & goal

New users should **pick a language** and **install the app as a PWA** before they reach
login/register. The app already detects standalone mode (`display-mode: standalone` /
`navigator.standalone`, used by `InstallBanner`) and stores a per-user `language`. Auth
pages (`/login`, `/register`) currently each self-wrap `I18nProvider initial="en"`.

## Decisions (autonomous, best-practice)

- **Where:** a new **`src/app/(auth)/layout.tsx`** (server) wraps login+register. It reads a
  `lang` cookie (`next/headers`), provides `I18nProvider initial={lang}`, and mounts a client
  **`OnboardingGate`** around the children. Login/register pages drop their own `I18nProvider`
  (the layout provides it) — keep their forms unchanged otherwise.
- **Gate flow** (client, resolved in `useEffect` to avoid SSR/hydration mismatch — initial render is a neutral splash):
  1. **Language step** — if no `lang` cookie yet, show two big buttons: **English** / **မြန်မာ**.
     Choosing writes `document.cookie = "lang=<v>; path=/; max-age=31536000; samesite=lax"`,
     calls `setLang(v)`, and advances. (Cookie lets the server layout seed i18n and lets register
     default the new user's language.)
  2. **Install step** — if NOT standalone, show platform-aware install UI:
     - Android/Chromium (a `beforeinstallprompt` event was captured): an **Install** button that
       calls `prompt()`.
     - iOS Safari: the "**Tap Share → Add to Home Screen**" steps (no programmatic prompt exists).
     - Other/desktop: the same steps + a small secondary **"Continue in browser"** link (escape
       hatch so we never hard-brick access where install is unavailable).
  3. **Ready** — when standalone (relaunched from the installed icon) AND a language is chosen,
     render the children (the actual login/register page). If the user took the browser escape,
     also render children.
- **Strength:** install is the prominent, default path (gate blocks the auth form until standalone),
  but the "Continue in browser" escape prevents lockouts on platforms that can't install. Language
  is mandatory (no skip).
- **Register language seed:** the register API/flow sets the new player's `language` from the chosen
  lang (cookie) instead of the hardcoded default, so the account matches the onboarding choice.

## Components

- **New `src/app/(auth)/layout.tsx`** (server): cookie read + `I18nProvider` + `<OnboardingGate>`.
- **New `src/components/OnboardingGate.tsx`** (client): the 3-state machine above. Reuses the
  standalone-detection logic already in `InstallBanner` (and `beforeinstallprompt` capture). Dark
  themed (Dark Stadium tokens), brand `3fqik`, triband accent.
- **Modify** `src/app/(auth)/login/page.tsx`, `src/app/(auth)/register/page.tsx`,
  `src/components/RegisterForm.tsx`: remove self-`I18nProvider` (use layout's); register passes the
  chosen language to the create call.
- **Modify** `src/lib/i18n/en.ts` + `mm.ts`: onboarding keys (`obChooseLanguage`, `obInstallTitle`,
  `obInstallStepsIos`, `obInstallAndroid`, `obContinueBrowser`, etc.).
- **Maybe modify** register API (`src/app/api/auth/register/route.ts`) to accept `language`.

## Out of scope

- Gating `/invite-only` or any in-app page (auth entry is the gate). Forcing install on already-
  registered returning users beyond the auth screen. Feature C.

## Constraints

- Client detection in `useEffect` only (no hydration mismatch); respect `prefers-reduced-motion`;
  dark tokens; EN/MM parity test; tap targets ≥44px, focus rings. lint+test+build green.
  `grade.ts`/money core untouched. Deploy: dev→main→prod folder `git pull && npm run build` +
  restart (no migration). Branch `feature/onboarding-gate`.

## Verification

1. Fresh browser (not standalone, no cookie): see language picker → pick → see install screen
   (platform-correct) → "Continue in browser" reveals login. Cookie persists language across reload.
2. Simulated standalone (DevTools display-mode): after language, go straight to login.
3. Register in mm → new player's `language` is `mm`.
4. Login/register still function; i18n switches with the chosen language; admin/player unaffected.
5. lint + full test suite + build green; EN/MM parity passes.
