"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n";

type GateState = "loading" | "language" | "install" | "ready";
type Platform = "ios" | "android";

// sessionStorage flag: once a user opts to continue without installing we must
// not re-trap them on the next auth page (or a reload of it).
const SKIP_KEY = "ob_skip_install";

// Loosely-typed beforeinstallprompt event (see InstallBanner.tsx)
interface InstallPrompt {
  prompt: () => Promise<void>;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator &&
      Boolean((navigator as { standalone?: boolean }).standalone))
  );
}

function detectPlatform(): Platform {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua) && !/android/i.test(ua)) return "ios";
  return "android";
}

// Installing is impossible inside an in-app webview (Facebook/Messenger/
// Instagram/Line) — the single biggest install show-stopper. On iOS, "Add to
// Home Screen" additionally only works in real Safari, so non-Safari iOS
// browsers (Chrome=CriOS, Firefox=FxiOS, Edge=EdgiOS) count too. On Android the
// `; wv)` token marks a system WebView. Detect this so we can tell the user to
// reopen in their real browser.
function isInAppBrowser(platform: Platform): boolean {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const webview =
    /FBAN|FBAV|FB_IAB|Instagram|Line|MicroMessenger|Twitter|GSA/i.test(ua);
  if (platform === "ios") return webview || /CriOS|FxiOS|EdgiOS/i.test(ua);
  return webview || /;\s*wv\)/i.test(ua);
}

/** iOS share glyph (box with up-arrow) so users recognise the button to tap. */
function ShareIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="inline-block align-text-bottom text-us-neon"
      aria-hidden
    >
      <path d="M12 16V4" />
      <path d="m8 8 4-4 4 4" />
      <path d="M4 12v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6" />
    </svg>
  );
}

/** Android overflow (⋮) glyph so users recognise the menu button to tap. */
function MenuIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="currentColor"
      className="inline-block align-text-bottom text-us-neon"
      aria-hidden
    >
      <circle cx="12" cy="5" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="12" cy="19" r="1.6" />
    </svg>
  );
}

/** Numbered step bullet for the iOS/Android instructions. */
function StepNum({ n }: { n: number }) {
  return (
    <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-mx text-sm font-bold text-white">
      {n}
    </span>
  );
}

/** Brand lockup, repeated in every state so the gate has one constant identity. */
function Brand() {
  return (
    <div className="text-center">
      <p className="text-base font-semibold uppercase tracking-widest text-faint">
        FIFA World Cup
      </p>
      <h1 className="text-5xl font-bold text-ink">
        3fqik<span className="font-display text-6xl">26</span>
      </h1>
      <div className="triband mx-auto mt-3 w-32 rounded-full" />
    </div>
  );
}

export function OnboardingGate({
  hasLangCookie,
  children,
}: {
  hasLangCookie: boolean;
  children: React.ReactNode;
}) {
  const { t, setLang } = useT();
  const router = useRouter();
  // Single consolidated state so the mount effect does ONE synchronous update
  // (avoids the cascading-setState lint error — see InstallBanner.tsx).
  const [gate, setGate] = useState<{
    state: GateState;
    platform: Platform;
    inApp: boolean;
    deferredPrompt: InstallPrompt | null;
  }>({
    state: "loading",
    platform: "android",
    inApp: false,
    deferredPrompt: null,
  });
  const { state, platform, inApp, deferredPrompt } = gate;
  // Once the user opts to continue without installing we never re-show install.
  const escapedRef = useRef(false);

  useEffect(() => {
    const standalone = isStandalone();
    const plt = detectPlatform();
    const inApp = isInAppBrowser(plt);
    // A prior "continue without installing" choice persists for this tab.
    let skipped = escapedRef.current;
    try {
      if (window.sessionStorage.getItem(SKIP_KEY) === "1") skipped = true;
    } catch {
      // sessionStorage may be blocked — fall back to the in-memory ref
    }
    escapedRef.current = skipped;

    function onPrompt(e: Event) {
      e.preventDefault();
      setGate((g) => ({ ...g, deferredPrompt: e as unknown as InstallPrompt }));
    }
    window.addEventListener("beforeinstallprompt", onPrompt);

    // Re-launching from the installed icon fires visibilitychange; if we are now
    // standalone, drop straight through to the app.
    function onVisibility() {
      if (document.visibilityState === "visible" && isStandalone()) {
        setGate((g) => ({ ...g, state: "ready" }));
      }
    }
    document.addEventListener("visibilitychange", onVisibility);

    const next: GateState = !hasLangCookie
      ? "language"
      : !standalone && !skipped
        ? "install"
        : "ready";
    // One synchronous state update on mount.
    setGate((g) => ({ ...g, state: next, platform: plt, inApp }));

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [hasLangCookie]);

  function chooseLang(v: "en" | "mm") {
    document.cookie = `lang=${v}; path=/; max-age=31536000; samesite=lax`;
    setLang(v);
    setGate((g) => ({ ...g, state: isStandalone() ? "ready" : "install" }));
  }

  function markSkipped() {
    escapedRef.current = true;
    try {
      window.sessionStorage.setItem(SKIP_KEY, "1");
    } catch {
      // ignore — the in-memory ref still holds for this mount
    }
  }

  // Backup path: skip the install step and go straight to login / register.
  function goAuth(path: "/login" | "/register") {
    markSkipped();
    setGate((g) => ({ ...g, state: "ready" }));
    router.push(path);
  }

  async function installApp() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
  }

  if (state === "ready") return <>{children}</>;

  const shellClass =
    "mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-8 bg-canvas p-6";
  const tapTarget =
    "min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us";

  if (state === "loading") {
    return (
      <main className={shellClass}>
        <Brand />
      </main>
    );
  }

  if (state === "language") {
    return (
      <main className={shellClass}>
        <div className="text-center">
          <Brand />
          <p className="mt-6 text-2xl font-bold text-ink">{t.obWelcome}</p>
          <p className="mt-1 text-base text-muted">{t.obChooseLanguage}</p>
        </div>
        <div className="flex flex-col gap-3">
          <button
            onClick={() => chooseLang("en")}
            className={`${tapTarget} w-full rounded-lg border border-border bg-surface p-5 text-xl font-semibold text-ink active:opacity-80`}
          >
            {t.langEnglish}
          </button>
          <button
            onClick={() => chooseLang("mm")}
            className={`${tapTarget} w-full rounded-lg border border-border bg-surface p-5 text-xl font-semibold text-ink active:opacity-80`}
          >
            {t.langBurmeseNative}
          </button>
        </div>
      </main>
    );
  }

  // state === "install"
  return (
    <main className={shellClass}>
      <Brand />
      <div className="text-center">
        <p className="text-2xl font-bold text-ink">{t.obInstallTitle}</p>
        <p className="mt-2 text-base leading-relaxed text-muted">
          {t.obInstallWhy}
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {/* Android: one-tap native install when the browser offers it… */}
        {platform === "android" && deferredPrompt && (
          <button
            onClick={installApp}
            className={`${tapTarget} w-full rounded-lg bg-mx p-5 text-xl font-semibold text-white active:opacity-80`}
          >
            {t.obInstallAndroid}
          </button>
        )}

        {/* …otherwise (Firefox, in-app webview, criteria not yet met) guide
            them through the Chrome menu manually. */}
        {platform === "android" && !deferredPrompt && (
          <div className="rounded-lg border border-border bg-surface p-4">
            {inApp && (
              <p className="mb-4 rounded-md border border-gold/40 bg-gold/10 p-3 text-sm leading-relaxed text-gold">
                {t.obInstallAndroidNote}
              </p>
            )}
            <ol className="space-y-3">
              <li className="flex items-start gap-3 text-base leading-relaxed text-ink">
                <StepNum n={1} />
                <span>
                  {t.obInstallAndroidStep1} <MenuIcon />
                </span>
              </li>
              <li className="flex items-start gap-3 text-base leading-relaxed text-ink">
                <StepNum n={2} />
                <span>{t.obInstallAndroidStep2}</span>
              </li>
            </ol>
          </div>
        )}

        {platform === "ios" && (
          <div className="rounded-lg border border-border bg-surface p-4">
            {inApp && (
              <p className="mb-4 rounded-md border border-gold/40 bg-gold/10 p-3 text-sm leading-relaxed text-gold">
                {t.obInstallIosSafariNote}
              </p>
            )}
            <ol className="space-y-3">
              <li className="flex items-start gap-3 text-base leading-relaxed text-ink">
                <StepNum n={1} />
                <span>
                  {t.obInstallIosStep1} <ShareIcon />
                </span>
              </li>
              <li className="flex items-start gap-3 text-base leading-relaxed text-ink">
                <StepNum n={2} />
                <span>{t.obInstallIosStep2}</span>
              </li>
              <li className="flex items-start gap-3 text-base leading-relaxed text-ink">
                <StepNum n={3} />
                <span>{t.obInstallIosStep3}</span>
              </li>
            </ol>
          </div>
        )}

        <p className="text-center text-sm text-faint">{t.obOpenInstalled}</p>

        {/* Backup: install can be fiddly (especially iOS Safari) — let players
            go straight to login / register without installing. */}
        <div className="mt-1 border-t border-border pt-4">
          <p className="mb-3 text-center text-sm text-muted">
            {t.obBackupPrompt}
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => goAuth("/login")}
              className={`${tapTarget} flex-1 rounded-lg border border-border bg-surface p-4 text-base font-semibold text-ink active:opacity-80`}
            >
              {t.login}
            </button>
            <button
              onClick={() => goAuth("/register")}
              className={`${tapTarget} flex-1 rounded-lg bg-us p-4 text-base font-semibold text-white active:opacity-80`}
            >
              {t.register}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
