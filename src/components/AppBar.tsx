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
        3f<span className="text-gold">qik</span>
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
