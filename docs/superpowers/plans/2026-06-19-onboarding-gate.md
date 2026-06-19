# Onboarding Gate — Implementation Plan (Feature B)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Use the `frontend-design` skill for the gate UI (dark Dark Stadium theme).

**Goal:** Before login/register, require a language choice and prompt PWA install; show the auth form once installed (standalone) or via a small "Continue in browser" escape.

**Architecture:** A server `(auth)/layout.tsx` reads a `lang` cookie, provides `I18nProvider`, and wraps children in a client `OnboardingGate` (language → install → ready state machine; detection in `useEffect`). Login/register stop self-providing i18n; register seeds the new user's language from the choice.

**Branch:** `feature/onboarding-gate`.

---

## Task 1: Onboarding i18n keys

**Files:** `src/lib/i18n/en.ts`, `src/lib/i18n/mm.ts`.

- [ ] Add keys (en), then identical keys in mm (parity test enforces):

```ts
  obChooseLanguage: "Choose your language",
  obWelcome: "Welcome to 3fqik",
  obInstallTitle: "Install the app",
  obInstallWhy: "Install 3fqik to your home screen for the full app experience.",
  obInstallAndroid: "Install app",
  obInstallIosSteps: "In Safari: tap the Share icon, then 'Add to Home Screen'.",
  obOpenInstalled: "After installing, open 3fqik from your home screen.",
  obContinueBrowser: "Continue in browser",
  langEnglish: "English",
  langБurmeseNative: "မြန်မာ",
```

(Use `langBurmeseNative: "မြန်မာ"` — ascii key name; value Burmese. For mm.ts use Burmese values for the ob\*/welcome strings; keep `langEnglish: "English"` and `langBurmeseNative: "မြန်မာ"` identical in both since they're proper labels.)

- [ ] `npx vitest run src/lib/i18n/i18n.test.ts` (parity) + `npm run lint`. Commit: `feat(onboarding): i18n keys`.

## Task 2: OnboardingGate + (auth) layout + page wiring

**Files:** Create `src/app/(auth)/layout.tsx`, `src/components/OnboardingGate.tsx`; Modify `src/app/(auth)/login/page.tsx`, `src/app/(auth)/register/page.tsx`, `src/components/RegisterForm.tsx`.

- [ ] **`(auth)/layout.tsx`** (server):

```tsx
import { cookies } from "next/headers";
import { I18nProvider } from "@/lib/i18n";
import { OnboardingGate } from "@/components/OnboardingGate";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const lang = (await cookies()).get("lang")?.value === "mm" ? "mm" : "en";
  return (
    <I18nProvider initial={lang}>
      <OnboardingGate hasLangCookie={(await cookies()).get("lang") != null}>
        {children}
      </OnboardingGate>
    </I18nProvider>
  );
}
```

(Next 16: `cookies()` is async — `await` it. Read once into a const and reuse.)

- [ ] **`OnboardingGate.tsx`** (client): state machine. On mount (`useEffect`): detect standalone (`matchMedia("(display-mode: standalone)").matches || navigator.standalone`); detect platform (ios vs android via UA, mirroring `InstallBanner.detectPlatform`); capture `beforeinstallprompt`. State: `"loading" | "language" | "install" | "ready"`.
  - If `!hasLangCookie` → `"language"`.
  - else if not standalone and not escaped → `"install"`.
  - else → `"ready"` (render `{children}`).
  - **Language step:** title `t.obChooseLanguage`; two big buttons `t.langEnglish` / `t.langBurmeseNative`. onClick(v): `document.cookie = "lang="+v+"; path=/; max-age=31536000; samesite=lax"`, `setLang(v)` (from `useT()`), then set state to (standalone ? "ready" : "install").
  - **Install step:** `t.obInstallTitle` + `t.obInstallWhy`. If android prompt captured → an `t.obInstallAndroid` button calling `prompt()`. If ios → `t.obInstallIosSteps`. Always show `t.obOpenInstalled` and a small secondary `t.obContinueBrowser` link that sets state `"ready"` (escape). Re-check standalone on `visibilitychange` so relaunch flips to ready.
  - **loading:** render a neutral dark splash (avoids SSR/hydration mismatch — never render the gated decision during SSR; gate computes in effect).
  - Dark Stadium tokens, `3fqik` brand + triband, focus rings, ≥44px buttons, respect `prefers-reduced-motion`.
- [ ] **login/register pages:** remove the inner `<I18nProvider initial="en">` wrapper (the layout now provides it); keep the form components. (Keep `InstallBanner` out of the auth pages or leave — gate covers install; removing the banner from auth is cleaner but optional.)
- [ ] **register language seed:** in `RegisterForm.tsx`, read the current `lang` from `useT()` and pass it to the register API call; in `src/app/api/auth/register/route.ts`, accept an optional `language` ("en"|"mm") and set it on the created player (default "en" if absent). Confirm the create path writes `language`.
- [ ] `npm run build && npm run lint` (pass). Commit: `feat(onboarding): install + language gate before auth`.

## Task 3: Verify + deploy

- [ ] `npm run lint && npm test && npm run build` green (no new unit tests needed; parity + existing suite).
- [ ] Manual (staging): fresh browser → language picker → install screen (iOS steps / Android button) → "Continue in browser" → login; pick mm → UI switches; register in mm → player.language=mm; DevTools display-mode:standalone → skips install.
- [ ] Merge `feature/onboarding-gate` → main, push; prod folder `git pull && npm run build` + `sudo systemctl restart worldbet worldbet-staging` (NO migration). Verify both healthy.

## Notes

- No money/grading changes. No migration. Detection strictly in `useEffect`. Use `frontend-design` for the gate visuals.
