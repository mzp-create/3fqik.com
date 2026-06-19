"use client";
import { useEffect, useReducer } from "react";
import { useT } from "@/lib/i18n";

const DISMISSED_KEY = "wb_install_dismissed";
const DISMISS_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

type Platform = "android" | "ios" | "none";

interface BannerState {
  platform: Platform;
  visible: boolean;
  deferredPrompt: Event | null;
}

type BannerAction =
  | { type: "show_ios" }
  | { type: "show_android"; prompt: Event }
  | { type: "hide" }
  | { type: "prompt_consumed" };

function reducer(state: BannerState, action: BannerAction): BannerState {
  switch (action.type) {
    case "show_ios":
      return { platform: "ios", visible: true, deferredPrompt: null };
    case "show_android":
      return {
        platform: "android",
        visible: true,
        deferredPrompt: action.prompt,
      };
    case "hide":
      return { ...state, visible: false };
    case "prompt_consumed":
      return { ...state, deferredPrompt: null, visible: false };
  }
}

function detectPlatform(): Platform {
  if (typeof window === "undefined") return "none";
  // Already installed as standalone — never show
  if (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator &&
      (navigator as { standalone?: boolean }).standalone)
  ) {
    return "none";
  }
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua) && !/android/i.test(ua)) return "ios";
  // Android Chrome (or Samsung Browser) — BeforeInstallPromptEvent handles it
  return "android";
}

function wasDismissedRecently(): boolean {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    if (!raw) return false;
    return Date.now() - Number(raw) < DISMISS_TTL_MS;
  } catch {
    return false;
  }
}

function recordDismissal() {
  try {
    localStorage.setItem(DISMISSED_KEY, String(Date.now()));
  } catch {
    // storage blocked — ignore
  }
}

export function InstallBanner() {
  const { t } = useT();
  const [state, dispatch] = useReducer(reducer, {
    platform: "none",
    visible: false,
    deferredPrompt: null,
  });

  useEffect(() => {
    const plt = detectPlatform();
    if (plt === "none" || wasDismissedRecently()) return;

    if (plt === "ios") {
      // Single dispatch — one state update, no cascading-setState lint error
      dispatch({ type: "show_ios" });
      return;
    }

    // Android: wait for beforeinstallprompt (fires in a callback — fine)
    function onPrompt(e: Event) {
      e.preventDefault();
      dispatch({ type: "show_android", prompt: e });
    }
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  function dismiss() {
    recordDismissal();
    dispatch({ type: "hide" });
  }

  async function install() {
    if (!state.deferredPrompt) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (state.deferredPrompt as any).prompt();
    dispatch({ type: "prompt_consumed" });
  }

  if (!state.visible) return null;

  return (
    <div
      role="banner"
      aria-label={t.installTitle}
      className="fixed bottom-0 left-0 right-0 z-50 flex items-center gap-3 border border-border bg-surface-2 px-4 py-4 text-ink shadow-lg"
      style={{
        borderTop: "3px solid transparent",
        borderImage:
          "linear-gradient(to right, #007A33 33.33%, #E03C31 33.33% 66.66%, #0A3A82 66.66%) 1",
      }}
    >
      {/* Icon strip */}
      <div className="flex-shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icon-192.png"
          alt="3fqik26"
          width={44}
          height={44}
          className="rounded-lg"
        />
      </div>

      {/* Text */}
      <p className="flex-1 text-sm font-semibold leading-tight text-ink">
        {t.installTitle}
        {state.platform === "ios" && (
          <>
            <br />
            <span className="text-xs font-normal text-muted">
              {t.installIos}
            </span>
          </>
        )}
      </p>

      {/* Action buttons */}
      <div className="flex flex-shrink-0 items-center gap-2">
        {state.platform === "android" && (
          <button
            onClick={install}
            className="min-h-[44px] rounded-md bg-mx px-4 py-2 text-sm font-bold text-white active:opacity-80"
          >
            {t.installBtn}
          </button>
        )}
        <button
          onClick={dismiss}
          aria-label={t.dismiss}
          className="min-h-[44px] min-w-[44px] rounded-md px-3 py-2 text-sm text-faint active:text-ink"
        >
          ×
        </button>
      </div>
    </div>
  );
}
