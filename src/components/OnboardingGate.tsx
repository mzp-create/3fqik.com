"use client";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";

type GateState = "loading" | "language" | "install" | "ready";
type Platform = "ios" | "android";

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
  // Single consolidated state so the mount effect does ONE synchronous update
  // (avoids the cascading-setState lint error — see InstallBanner.tsx).
  const [gate, setGate] = useState<{
    state: GateState;
    platform: Platform;
    deferredPrompt: InstallPrompt | null;
  }>({ state: "loading", platform: "android", deferredPrompt: null });
  const { state, platform, deferredPrompt } = gate;
  // Once the user opts to continue in-browser we never re-show install.
  const escapedRef = useRef(false);

  useEffect(() => {
    const standalone = isStandalone();
    const plt = detectPlatform();

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
      : !standalone && !escapedRef.current
        ? "install"
        : "ready";
    // One synchronous state update on mount.
    setGate((g) => ({ ...g, state: next, platform: plt }));

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

  function continueInBrowser() {
    escapedRef.current = true;
    setGate((g) => ({ ...g, state: "ready" }));
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
        {platform === "android" && deferredPrompt && (
          <button
            onClick={installApp}
            className={`${tapTarget} w-full rounded-lg bg-mx p-5 text-xl font-semibold text-white active:opacity-80`}
          >
            {t.obInstallAndroid}
          </button>
        )}
        {platform === "ios" && (
          <p className="rounded-lg border border-border bg-surface p-5 text-base leading-relaxed text-ink">
            {t.obInstallIosSteps}
          </p>
        )}
        <p className="text-center text-sm text-faint">{t.obOpenInstalled}</p>
        <button
          onClick={continueInBrowser}
          className={`${tapTarget} mx-auto text-base text-us-neon underline`}
        >
          {t.obContinueBrowser}
        </button>
      </div>
    </main>
  );
}
