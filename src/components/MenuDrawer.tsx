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

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  if (!open) return null;

  const item =
    "block rounded-lg px-3 py-3 text-base font-semibold text-ink hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us";

  return (
    <div className="fixed inset-0 z-30 bg-ink/60" onClick={onClose}>
      <div
        className="absolute top-0 right-0 h-full w-72 max-w-[80%] bg-surface-2 p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-4 flex items-center justify-between">
          <span className="font-display text-lg text-ink">{name}</span>
          <button
            onClick={onClose}
            aria-label={t.closeMenu}
            className="rounded-lg px-2 text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
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
          <Link href="/practice" className={item} onClick={onClose}>
            {t.practiceTry}
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className={`w-full text-left ${item}`}
          >
            {t.menuLogout}
          </button>
        </nav>
        <div className="triband mt-6" />
      </div>
    </div>
  );
}
