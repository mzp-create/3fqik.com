# WC26 Design System — Tri-Band Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle WorldBet2026 to a FIFA World Cup 2026-inspired design system with Anton numerals, tri-band identity, and semantic color palette — without changing any logic, i18n keys, or component APIs.

**Architecture:** CSS-first approach using Tailwind v4 `@theme` tokens in `globals.css` for all brand colors and font variables. Anton font loaded via `next/font/google` in `layout.tsx` for Latin numerals/codes only. Component files receive new Tailwind class strings while keeping all event handlers, state, and data fetching unchanged.

**Tech Stack:** Next.js 16 App Router, Tailwind v4 (CSS `@theme`), `next/font/google` (Anton + existing Geist), TypeScript.

---

## File Map

| File                                | Action | Responsibility                                                 |
| ----------------------------------- | ------ | -------------------------------------------------------------- |
| `src/app/globals.css`               | Modify | Add `@theme` tokens, `.triband`, `.triband-skew` utilities     |
| `src/app/layout.tsx`                | Modify | Add Anton font, update body classes                            |
| `src/app/(auth)/login/page.tsx`     | Modify | Canvas bg, WorldBet + 26 hero, triband, ink inputs             |
| `src/app/(auth)/register/page.tsx`  | Modify | Same hero treatment as login                                   |
| `src/components/Tabs.tsx`           | Modify | White bar, triband active underline, ink/gray text             |
| `src/components/MatchCard.tsx`      | Modify | Odds tiles with colored rail, LIVE badge, font-display prices  |
| `src/components/BetSlip.tsx`        | Modify | Bottom sheet, drag handle, font-display stake, bg-mx confirm   |
| `src/components/TicketCard.tsx`     | Modify | Event-ticket aesthetic, triband top, stamp overlay, canvas PNG |
| `src/app/(player)/bets/page.tsx`    | Modify | Status pill colors updated to new palette                      |
| `src/app/(player)/balance/page.tsx` | Modify | Day status pills, ledger rows, gold ref chip, font-display net |
| `src/app/(player)/profile/page.tsx` | Modify | Section headers, primary button style                          |
| `src/app/t/[ticketNo]/page.tsx`     | Modify | mx-green VERIFIED stamp / ca-red NOT VALID header              |
| `src/app/admin/layout.tsx`          | Modify | Ink bg nav, white links, triband bottom border                 |

---

## Task 1: CSS Design Tokens + Triband Utility

**Files:**

- Modify: `src/app/globals.css`

- [ ] **Step 1: Replace globals.css with new design tokens**

Replace the entire file with:

```css
@import "tailwindcss";

@theme {
  --color-canvas: #fafaf7;
  --color-ink: #14161b;
  --color-mx: #007a33;
  --color-ca: #e03c31;
  --color-us: #0a3a82;
  --color-gold: #f5b335;
  --font-display: var(--font-anton), sans-serif;
  --font-sans: var(--font-geist-sans), sans-serif;
  --font-mono: var(--font-geist-mono), monospace;
}

body {
  background-color: var(--color-canvas);
  color: var(--color-ink);
}

/* Triband: 3 equal horizontal stripes — mx-green / ca-red / us-blue */
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

/* LIVE pulse dot — motion only when user has no reduced-motion preference */
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

- [ ] **Step 2: Verify TypeScript still compiles (no CSS errors affect TS)**

```bash
cd /mnt/hermes-data/mmzphyo/Projects/WorldBet2026 && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

---

## Task 2: Root Layout — Anton Font + Body Classes

**Files:**

- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Add Anton import and variable**

Replace the layout file with:

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono, Anton } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const anton = Anton({
  weight: "400",
  variable: "--font-anton",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "WorldBet2026",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${anton.variable} h-full antialiased`}
    >
      {/* suppressHydrationWarning: browser extensions (e.g. Grammarly) inject
          attributes into <body> before hydration; attribute-only, body-only. */}
      <body
        className="min-h-full flex flex-col bg-canvas text-ink"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Verify TS**

```bash
cd /mnt/hermes-data/mmzphyo/Projects/WorldBet2026 && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

---

## Task 3: Login Page Restyle

**Files:**

- Modify: `src/app/(auth)/login/page.tsx`

- [ ] **Step 1: Restyle login page — keep ALL logic, handlers, i18n**

Replace the JSX return inside `LoginForm` (keep all state/handlers identical, only change the returned JSX):

```tsx
return (
  <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 bg-canvas p-6">
    {/* App name hero */}
    <div className="text-center">
      <p className="text-sm font-semibold uppercase tracking-widest text-ink/50">
        FIFA World Cup
      </p>
      <h1 className="text-4xl font-bold text-ink">
        WorldBet<span className="font-display text-5xl">26</span>
      </h1>
      <div className="triband-skew mx-auto mt-2 w-32" />
    </div>

    <input
      className="rounded-lg border border-ink/20 bg-white p-4 text-lg text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
      inputMode="tel"
      placeholder={t.phone}
      value={phone}
      onChange={(e) => setPhone(e.target.value)}
    />
    <input
      className="rounded-lg border border-ink/20 bg-white p-4 text-lg tracking-widest text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
      inputMode="numeric"
      maxLength={6}
      type="password"
      placeholder={t.pin}
      value={pin}
      onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
    />
    {error && <p className="text-center text-sm text-ca">{error}</p>}
    <button
      className="rounded-lg bg-ink p-4 text-lg font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
      onClick={submit}
    >
      {t.login}
    </button>
    <a className="text-center text-sm text-us underline" href="/register">
      {t.register}
    </a>
  </main>
);
```

- [ ] **Step 2: Verify TS**

```bash
cd /mnt/hermes-data/mmzphyo/Projects/WorldBet2026 && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

---

## Task 4: Register Page Restyle

**Files:**

- Modify: `src/app/(auth)/register/page.tsx`

- [ ] **Step 1: Restyle register page — keep ALL logic, handlers, i18n**

Replace the JSX return inside `RegisterForm` (keep all state/handlers identical):

```tsx
return (
  <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 bg-canvas p-6">
    {/* App name hero (same as login) */}
    <div className="text-center">
      <p className="text-sm font-semibold uppercase tracking-widest text-ink/50">
        FIFA World Cup
      </p>
      <h1 className="text-3xl font-bold text-ink">
        WorldBet<span className="font-display text-4xl">26</span>
      </h1>
      <div className="triband-skew mx-auto mt-2 w-32" />
      <p className="mt-2 text-sm font-semibold text-ink/60">{t.register}</p>
    </div>

    <input
      className="rounded-lg border border-ink/20 bg-white p-4 text-lg text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
      placeholder={t.inviteCode}
      value={form.code}
      onChange={set("code")}
    />
    <input
      className="rounded-lg border border-ink/20 bg-white p-4 text-lg text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
      inputMode="tel"
      placeholder={t.phone}
      value={form.phone}
      onChange={set("phone")}
    />
    <input
      className="rounded-lg border border-ink/20 bg-white p-4 text-lg text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
      placeholder={t.displayName}
      value={form.name}
      onChange={set("name")}
    />
    <input
      className="rounded-lg border border-ink/20 bg-white p-4 text-lg tracking-widest text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
      type="password"
      inputMode="numeric"
      maxLength={6}
      placeholder={t.pin}
      value={form.pin}
      onChange={set("pin")}
    />
    <input
      className="rounded-lg border border-ink/20 bg-white p-4 text-lg tracking-widest text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
      type="password"
      inputMode="numeric"
      maxLength={6}
      placeholder={t.pinConfirm}
      value={form.pin2}
      onChange={set("pin2")}
    />
    {error && <p className="text-center text-sm text-ca">{error}</p>}
    <button
      className="rounded-lg bg-ink p-4 text-lg font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
      onClick={submit}
    >
      {t.register}
    </button>
  </main>
);
```

- [ ] **Step 2: Verify TS**

```bash
cd /mnt/hermes-data/mmzphyo/Projects/WorldBet2026 && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

---

## Task 5: Tabs Component

**Files:**

- Modify: `src/components/Tabs.tsx`

- [ ] **Step 1: Restyle Tabs — keep all href/label/isAdmin logic**

Replace the entire file content (keep imports and logic, change JSX):

```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/lib/i18n";

export function Tabs({ isAdmin }: { isAdmin: boolean }) {
  const { t } = useT();
  const path = usePathname();
  const tabs = [
    { href: "/", label: t.tabMatches },
    { href: "/bets", label: t.tabBets },
    { href: "/balance", label: t.tabBalance },
    { href: "/profile", label: "⚙︎" },
    ...(isAdmin ? [{ href: "/admin", label: "🛠️" }] : []),
  ];
  return (
    <nav className="fixed bottom-0 left-0 right-0 mx-auto flex max-w-md border-t border-ink/10 bg-white">
      {tabs.map((tab) => {
        const active = path === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`relative flex-1 p-4 text-center font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us ${
              active ? "text-ink" : "text-gray-400"
            }`}
          >
            {tab.label}
            {active && (
              <span
                className="triband absolute bottom-0 left-1/2 -translate-x-1/2"
                style={{ width: "80%", height: "3px" }}
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: Verify TS**

```bash
cd /mnt/hermes-data/mmzphyo/Projects/WorldBet2026 && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

---

## Task 6: MatchCard Component

**Files:**

- Modify: `src/components/MatchCard.tsx`

- [ ] **Step 1: Restyle MatchCard — keep ALL types, props, handlers, i18n**

Replace the entire file content:

```tsx
"use client";
import { useT } from "@/lib/i18n";
import { ball, price } from "@/lib/client/format";

export type LineRow = {
  id: number;
  version: number;
  favSide: "home" | "away";
  ballQ: number;
  priceC: number;
  status: string;
};
export type MatchRow = {
  id: number;
  stage: string;
  homeTeam: string;
  awayTeam: string;
  kickoffUtc: string;
  status: "scheduled" | "live" | "finished";
  homeScore: number | null;
  awayScore: number | null;
  line: LineRow | null;
};

export function MatchCard({
  match: m,
  onPick,
}: {
  match: MatchRow;
  onPick: (side: "fav" | "dog") => void;
}) {
  const { t } = useT();
  const l = m.line;
  const fav = l?.favSide === "home" ? m.homeTeam : m.awayTeam;
  const dog = l?.favSide === "home" ? m.awayTeam : m.homeTeam;
  const kickoff = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Yangon",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(m.kickoffUtc));

  return (
    <div
      className={`mb-3 rounded-xl border border-ink/10 bg-white p-3 shadow-sm ${l?.status === "suspended" ? "opacity-50" : ""}`}
    >
      {/* Eyebrow: stage + kickoff/live */}
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-ink/40">
          {m.stage}
        </span>
        {m.status === "live" ? (
          <span className="flex items-center gap-1.5 rounded-sm bg-ca px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-white">
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-white" />
            {t.live}
          </span>
        ) : (
          <span className="text-xs text-ink/40">{kickoff}</span>
        )}
      </div>

      {/* Teams */}
      <p className="font-semibold text-ink">
        {m.homeTeam} vs {m.awayTeam}
        {m.status === "live" && m.homeScore != null && (
          <span className="ml-2 font-display text-lg text-ca">
            {m.homeScore}–{m.awayScore}
          </span>
        )}
      </p>

      {!l && <p className="mt-2 text-center text-sm text-ink/30">—</p>}
      {l && l.status === "closed" && (
        <p className="mt-2 text-center text-sm text-ink/30">—</p>
      )}
      {l && l.status === "suspended" && (
        <p className="mt-2 text-center text-sm">⏸ {t.suspended}</p>
      )}
      {l && l.status === "active" && (
        <div className="mt-2 flex gap-2">
          {/* Favorite tile — green left rail */}
          <button
            className="relative flex-1 overflow-hidden rounded-lg border-2 border-ink bg-white p-3 text-left font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
            onClick={() => onPick("fav")}
          >
            <span className="absolute inset-y-0 left-0 w-1.5 bg-mx" />
            <span className="block pl-2 text-xs font-bold uppercase tracking-wider text-ink">
              {fav}
            </span>
            <span className="block pl-2 text-xs text-ink/50">
              −{ball(l.ballQ)}
            </span>
            <span className="font-display block pl-2 text-xl text-mx">
              {price(l.priceC)}
            </span>
          </button>

          {/* Underdog tile — blue left rail */}
          <button
            className="relative flex-1 overflow-hidden rounded-lg border-2 border-ink bg-white p-3 text-left font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
            onClick={() => onPick("dog")}
          >
            <span className="absolute inset-y-0 left-0 w-1.5 bg-us" />
            <span className="block pl-2 text-xs font-bold uppercase tracking-wider text-ink">
              {dog}
            </span>
            <span className="block pl-2 text-xs text-ink/50">
              +{ball(l.ballQ)}
            </span>
            <span className="font-display block pl-2 text-xl text-us">
              {price(l.priceC)}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TS**

```bash
cd /mnt/hermes-data/mmzphyo/Projects/WorldBet2026 && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

---

## Task 7: BetSlip Component

**Files:**

- Modify: `src/components/BetSlip.tsx`

- [ ] **Step 1: Restyle BetSlip — keep ALL state, api calls, error handling, i18n**

Replace the returned JSX (the `return (` block) inside the `BetSlip` function, keeping all imports and logic above it:

```tsx
return (
  <div className="fixed inset-0 z-10 bg-ink/40" onClick={onClose}>
    <div
      className="fixed bottom-0 left-0 right-0 mx-auto max-w-md rounded-t-2xl bg-white shadow-xl"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Drag handle */}
      <div className="flex justify-center pt-3 pb-1">
        <div className="h-1 w-10 rounded-full bg-ink/20" />
      </div>

      <div className="p-4 pb-8">
        {/* Pick title */}
        <h2 className="font-display text-lg text-ink">
          {pickLabel(line, slip.match, slip.side)}
        </h2>
        {slip.match.status === "live" && (
          <p className="text-sm text-ca">
            {t.scoreNow}: {slip.match.homeScore}–{slip.match.awayScore} ·{" "}
            {t.liveNote}
          </p>
        )}

        {/* Stake input */}
        <input
          className="font-display my-3 w-full rounded-lg border border-ink/20 bg-white p-4 text-2xl text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
          inputMode="numeric"
          value={mmk(stake)}
          onChange={(e) =>
            setStake(Number(e.target.value.replace(/\D/g, "")) || 0)
          }
        />

        {/* Chips */}
        <div className="flex flex-wrap gap-2">
          {CHIPS.map((c) => (
            <button
              key={c}
              className="rounded-full border border-ink/20 px-3 py-1.5 text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
              onClick={() => setStake(c)}
            >
              {c >= 1_000_000 ? `${c / 1_000_000}M` : `${c / 1_000}k`}
            </button>
          ))}
        </div>

        {/* 5-outcome preview — 2-col grid */}
        <div className="my-3 grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-canvas p-3 text-sm leading-6">
          <span className="text-ink/50">{t.outWin}</span>
          <span className="font-semibold text-mx">{signedMmk(p.win)}</span>
          <span className="text-ink/50">{t.outHalfWin}</span>
          <span className="font-semibold text-mx">{signedMmk(p.halfWin)}</span>
          <span className="text-ink/50">{t.outPush}</span>
          <span className="font-semibold text-gray-500">0</span>
          <span className="text-ink/50">{t.outHalfLose}</span>
          <span className="font-semibold text-ca">
            {signedMmk(-p.halfLose)}
          </span>
          <span className="text-ink/50">{t.outLose}</span>
          <span className="font-semibold text-ca">{signedMmk(-p.lose)}</span>
        </div>

        {error && <p className="mb-2 text-center text-sm text-ca">{error}</p>}

        {/* CONFIRM — bg-mx (placing money = green) */}
        <button
          className="w-full rounded-lg bg-mx p-4 text-lg font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
          onClick={confirm}
        >
          {t.confirmBet}
        </button>
      </div>
    </div>
  </div>
);
```

- [ ] **Step 2: Verify TS**

```bash
cd /mnt/hermes-data/mmzphyo/Projects/WorldBet2026 && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

---

## Task 8: TicketCard Component

**Files:**

- Modify: `src/components/TicketCard.tsx`

- [ ] **Step 1: Restyle TicketCard — keep ALL types, QR logic, canvas PNG renderer (update ticket no only), i18n**

Replace the entire file:

```tsx
"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useT } from "@/lib/i18n";
import { mmk, signedMmk, pickLabel } from "@/lib/client/format";
import { statusKey } from "@/lib/client/status";

export type TicketRow = {
  ticketNo: string;
  side: "fav" | "dog";
  stakeMmk: number;
  status: string;
  scoreHomeAtBet: number;
  scoreAwayAtBet: number;
  placedAt: string;
  netMmk: number | null;
  qrUrl: string;
  match: { homeTeam: string; awayTeam: string; stage: string };
  line: { favSide: "home" | "away"; ballQ: number; priceC: number };
  playerName: string;
};

function formatMmt(isoStr: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Yangon",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(isoStr));
}

/** Stamp color based on ticket status */
function stampClasses(status: string): string {
  if (status === "won" || status === "half_won") {
    return "border-mx text-mx";
  }
  if (status === "lost" || status === "half_lost") {
    return "border-ca text-ca";
  }
  return "border-gray-400 text-gray-400";
}

/** Stamp label — shown only for graded tickets */
function stampLabel(status: string): string | null {
  if (status === "won") return "WON";
  if (status === "half_won") return "½ WON";
  if (status === "lost") return "LOST";
  if (status === "half_lost") return "½ LOST";
  if (status === "push") return "PUSH";
  if (status === "void") return "VOID";
  return null;
}

export function TicketCard({ ticket: b }: { ticket: TicketRow }) {
  const { t } = useT();
  const [qr, setQr] = useState("");
  const [qrError, setQrError] = useState(false);
  const stamp = stampLabel(b.status);

  useEffect(() => {
    QRCode.toDataURL(b.qrUrl, { width: 160 })
      .then(setQr)
      .catch(() => setQrError(true));
  }, [b.qrUrl]);

  async function save() {
    try {
      const qrData = qr || (await QRCode.toDataURL(b.qrUrl, { width: 160 }));
      const hasNet = b.netMmk != null;
      const canvasHeight = hasNet ? 590 : 560;
      const canvas = document.createElement("canvas");
      canvas.width = 360;
      canvas.height = canvasHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, 360, canvasHeight);
      ctx.fillStyle = "#000";
      // Ticket number larger/bolder for PNG
      ctx.font = "bold 28px monospace";
      ctx.textAlign = "center";
      ctx.fillText(b.ticketNo, 180, 44);
      ctx.font = "15px sans-serif";
      ctx.textAlign = "left";
      const rows: [string, string][] = [
        [t.player, b.playerName],
        [t.match, `${b.match.homeTeam} vs ${b.match.awayTeam}`],
        [t.pick, pickLabel(b.line, b.match, b.side)],
        [t.stake, `${mmk(b.stakeMmk)} MMK`],
        [t.scoreAtBet, `${b.scoreHomeAtBet}–${b.scoreAwayAtBet}`],
        [t.placed, formatMmt(b.placedAt)],
        [t.statusLbl, t[statusKey(b.status)]],
      ];
      if (hasNet) {
        rows.push([t.net, `${signedMmk(b.netMmk!)} MMK`]);
      }
      rows.forEach(([k, v], idx) => {
        ctx.fillStyle = "#777";
        ctx.fillText(k, 24, 90 + idx * 30);
        ctx.fillStyle = "#000";
        ctx.fillText(v, 140, 90 + idx * 30);
      });
      const qrTop = 90 + rows.length * 30 + 10;
      const img = new Image();
      await new Promise((res) => {
        img.onload = res;
        img.src = qrData;
      });
      ctx.drawImage(img, 100, qrTop, 160, 160);
      const a = document.createElement("a");
      a.download = `${b.ticketNo}.png`;
      a.href = canvas.toDataURL("image/png");
      a.click();
    } catch {
      // save failed silently — QR or canvas unavailable
    }
  }

  return (
    <div>
      {/* Event-ticket card */}
      <div className="relative overflow-hidden rounded-xl border border-dashed border-ink/30 bg-white">
        {/* Triband top bar */}
        <div className="triband w-full" />

        {/* Stamp overlay for graded tickets */}
        {stamp && (
          <div
            className={`absolute right-3 top-6 rotate-[-8deg] rounded border-2 px-3 py-1 font-display text-sm uppercase opacity-80 ${stampClasses(b.status)}`}
          >
            {stamp}
          </div>
        )}

        <div className="p-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-ink/40">
            WORLDBET<span className="font-display">26</span> ·{" "}
            {t.ticket.toUpperCase()}
          </p>
          <p className="font-display mt-1 text-3xl tracking-wider text-ink">
            {b.ticketNo}
          </p>
          <hr className="my-3 border-dashed border-ink/20" />
          <dl className="text-left text-sm leading-7">
            <Row k={t.player} v={b.playerName} />
            <Row
              k={t.match}
              v={`${b.match.homeTeam} vs ${b.match.awayTeam} (${b.match.stage})`}
            />
            <Row k={t.pick} v={pickLabel(b.line, b.match, b.side)} />
            <Row k={t.stake} v={`${mmk(b.stakeMmk)} MMK`} />
            <Row
              k={t.scoreAtBet}
              v={`${b.scoreHomeAtBet}–${b.scoreAwayAtBet}`}
            />
            <Row k={t.placed} v={formatMmt(b.placedAt)} />
            <Row k={t.statusLbl} v={t[statusKey(b.status)]} />
            {b.netMmk != null && (
              <Row k={t.net} v={`${signedMmk(b.netMmk)} MMK`} />
            )}
          </dl>
          {!qrError && qr && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="QR" className="mx-auto mt-3 h-40 w-40" />
          )}
          <p className="mt-2 text-xs text-ink/40">{t.scanToVerify}</p>
        </div>
      </div>

      <button
        className="mt-2 w-full rounded-lg bg-ink p-3 font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us disabled:opacity-40"
        onClick={save}
        disabled={qrError}
      >
        💾 {t.saveTicket}
      </button>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-ink/50">{k}</dt>
      <dd className="font-medium text-ink">{v}</dd>
    </div>
  );
}
```

- [ ] **Step 2: Verify TS**

```bash
cd /mnt/hermes-data/mmzphyo/Projects/WorldBet2026 && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

---

## Task 9: Bets Page

**Files:**

- Modify: `src/app/(player)/bets/page.tsx`

- [ ] **Step 1: Update STATUS_COLORS and ticket row styling — keep ALL logic**

Replace `STATUS_COLORS` and ticket row JSX:

```tsx
const STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-500",
  won: "bg-mx/10 text-mx",
  half_won: "bg-mx/10 text-mx",
  push: "bg-gray-100 text-gray-500",
  half_lost: "bg-ca/10 text-ca",
  lost: "bg-ca/10 text-ca",
  void: "bg-gray-100 text-gray-400",
};
```

And update the ticket row button className to:

```
"mb-2 w-full rounded-xl border border-ink/10 bg-white p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
```

And update the inner ticket number span to use mono:

```
"font-mono text-sm font-bold text-ink"
```

And update the match/side text spans to `text-ink/60` (from `text-gray-600`), stake span to `text-ink/50`.

Full replacement of `BetsPage` return JSX:

```tsx
return (
  <main className="p-3">
    {error && <p className="mt-8 text-center text-sm text-ca">{error}</p>}
    {tickets.length === 0 && !error && (
      <p className="mt-8 text-center text-ink/40">{t.noBets}</p>
    )}
    {tickets.map((b) => (
      <button
        key={b.ticketNo}
        className="mb-2 w-full rounded-xl border border-ink/10 bg-white p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
        onClick={() => setSelected(b)}
      >
        <div className="flex items-center justify-between">
          <span className="font-mono text-sm font-bold text-ink">
            {b.ticketNo}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[b.status] ?? "bg-gray-100 text-gray-600"}`}
          >
            {t[statusKey(b.status)]}
          </span>
        </div>
        <div className="mt-1 text-sm text-ink/60">
          {b.match.homeTeam} vs {b.match.awayTeam} ·{" "}
          {b.side === "fav" ? t.sideFav : t.sideDog}
        </div>
        <div className="text-sm text-ink/50">
          {t.stake}: {b.stakeMmk.toLocaleString("en-US")} MMK
        </div>
      </button>
    ))}

    {selected && (
      <div
        className="fixed inset-0 z-20 bg-ink/50"
        onClick={() => setSelected(null)}
      >
        <div
          className="fixed bottom-0 left-0 right-0 mx-auto max-w-md overflow-y-auto rounded-t-2xl bg-white p-4 pb-8"
          style={{ maxHeight: "90vh" }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="mb-3 text-sm text-ink/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
            onClick={() => setSelected(null)}
          >
            ✕ {t.close}
          </button>
          <TicketCard ticket={selected} />
        </div>
      </div>
    )}
  </main>
);
```

- [ ] **Step 2: Verify TS**

```bash
cd /mnt/hermes-data/mmzphyo/Projects/WorldBet2026 && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

---

## Task 10: Balance Page

**Files:**

- Modify: `src/app/(player)/balance/page.tsx`

- [ ] **Step 1: Update DAY_STATUS_COLORS and all styling — keep ALL logic, data shapes, i18n**

Replace `DAY_STATUS_COLORS`:

```tsx
const DAY_STATUS_COLORS = {
  open: "border border-us text-us",
  closed: "border border-ca text-ca",
  settled: "bg-mx text-white",
};
```

Replace the full `return (` JSX of `BalancePage`:

```tsx
return (
  <main className="p-3">
    {error && <p className="mt-8 text-center text-sm text-ca">{error}</p>}
    {days.length === 0 && !error && (
      <p className="mt-8 text-center text-ink/40">{t.noDays}</p>
    )}
    {days.map((day) => {
      const net = day.items.reduce((s, i) => s + (i.netMmk ?? 0), 0);
      const dayStatusLabel =
        day.status === "open"
          ? t.dayOpen
          : day.status === "closed"
            ? t.dayClosed
            : t.daySettled;

      return (
        <section
          key={day.date}
          className="mb-4 rounded-xl border border-ink/10 bg-white p-3"
        >
          {/* Section header with triband accent */}
          <div className="mb-1 flex items-center gap-2">
            <div
              className="triband-skew h-4 w-1"
              style={{ height: "14px", width: "4px" }}
            />
            <div className="flex flex-1 items-center justify-between">
              <h2 className="font-bold text-ink">{day.date}</h2>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${DAY_STATUS_COLORS[day.status]}`}
              >
                {dayStatusLabel}
              </span>
            </div>
          </div>

          <div
            className={`mt-1 font-display text-lg ${net > 0 ? "text-mx" : net < 0 ? "text-ca" : "text-gray-500"}`}
          >
            {net === 0
              ? t.evenDay
              : net > 0
                ? `${t.housePays}: ${mmk(net)} MMK`
                : `${t.youPay}: ${mmk(-net)} MMK`}
          </div>

          {day.ref && (
            <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-gold/20 px-2 py-0.5 text-xs font-semibold text-ink">
              <span className="text-gold">●</span>
              {t.settledRef} · {day.ref}
            </p>
          )}
          {!day.ref && day.status !== "settled" && (
            <p className="text-xs text-ink/40">{t.unsettled}</p>
          )}

          <ul className="mt-2 divide-y divide-ink/5 text-sm">
            {day.items.map((item) => {
              const fav =
                item.favSide === "home" ? item.homeTeam : item.awayTeam;
              const dog =
                item.favSide === "home" ? item.awayTeam : item.homeTeam;
              const pickStr =
                item.side === "fav"
                  ? `${fav} −${ball(item.ballQ)} @ ${price(item.priceC)}`
                  : `${dog} +${ball(item.ballQ)} @ ${price(item.priceC)}`;
              return (
                <li key={item.id} className="py-2">
                  <div className="flex justify-between">
                    <span className="font-mono text-xs text-ink/40">
                      {item.ticketNo}
                    </span>
                    <span className="text-xs font-semibold uppercase text-ink/60">
                      {t[statusKey(item.status)]}
                    </span>
                  </div>
                  <div className="text-ink/80">{pickStr}</div>
                  <div className="flex justify-between text-xs text-ink/50">
                    <span>
                      {t.stake}: {mmk(item.stakeMmk)} MMK
                    </span>
                    {item.netMmk != null && (
                      <span
                        className={`font-display ${
                          item.netMmk > 0
                            ? "text-mx"
                            : item.netMmk < 0
                              ? "text-ca"
                              : "text-gray-500"
                        }`}
                      >
                        {t.net}: {signedMmk(item.netMmk)} MMK
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      );
    })}
  </main>
);
```

- [ ] **Step 2: Verify TS**

```bash
cd /mnt/hermes-data/mmzphyo/Projects/WorldBet2026 && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

---

## Task 11: Profile Page

**Files:**

- Modify: `src/app/(player)/profile/page.tsx`

- [ ] **Step 1: Restyle profile — keep ALL handlers, state, i18n**

Replace the full `return (` JSX:

```tsx
return (
  <main className="mx-auto max-w-sm p-6">
    {/* Section header */}
    <div className="mb-6 flex items-center gap-2">
      <div className="triband-skew" style={{ height: "14px", width: "4px" }} />
      <h1 className="text-xl font-bold text-ink">{t.changePin}</h1>
    </div>

    <div className="mb-6 flex flex-col gap-3">
      <input
        className="rounded-lg border border-ink/20 bg-white p-4 text-lg tracking-widest text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
        type="password"
        inputMode="numeric"
        maxLength={6}
        placeholder={t.currentPin}
        value={currentPin}
        onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ""))}
      />
      <input
        className="rounded-lg border border-ink/20 bg-white p-4 text-lg tracking-widest text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
        type="password"
        inputMode="numeric"
        maxLength={6}
        placeholder={t.newPin}
        value={newPin}
        onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
      />
      <input
        className="rounded-lg border border-ink/20 bg-white p-4 text-lg tracking-widest text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
        type="password"
        inputMode="numeric"
        maxLength={6}
        placeholder={t.pinConfirm}
        value={newPin2}
        onChange={(e) => setNewPin2(e.target.value.replace(/\D/g, ""))}
      />
      {pinError && <p className="text-center text-sm text-ca">{pinError}</p>}
      {pinSuccess && (
        <p className="text-center text-sm text-mx">{t.changePin} ✓</p>
      )}
      <button
        className="rounded-lg bg-ink p-4 text-lg font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
        onClick={handleChangePin}
      >
        {t.changePin}
      </button>
    </div>

    <hr className="my-6 border-ink/10" />

    <div className="mb-6">
      <p className="mb-3 font-semibold text-ink">{t.language}</p>
      <div className="flex gap-3">
        <button
          className={`flex-1 rounded-lg border p-3 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us ${
            lang === "en"
              ? "border-mx bg-mx/10 text-mx"
              : "border-ink/20 text-ink/50"
          }`}
          onClick={() => handleLanguage("en")}
        >
          English
        </button>
        <button
          className={`flex-1 rounded-lg border p-3 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us ${
            lang === "mm"
              ? "border-mx bg-mx/10 text-mx"
              : "border-ink/20 text-ink/50"
          }`}
          onClick={() => handleLanguage("mm")}
        >
          မြန်မာ
        </button>
      </div>
    </div>

    <hr className="my-6 border-ink/10" />

    <button
      className="w-full rounded-lg bg-ca p-4 text-lg font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us disabled:opacity-50"
      onClick={handleLogout}
      disabled={loggingOut}
    >
      {t.logout}
    </button>
  </main>
);
```

- [ ] **Step 2: Verify TS**

```bash
cd /mnt/hermes-data/mmzphyo/Projects/WorldBet2026 && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

---

## Task 12: Ticket Verify Page (Server Component)

**Files:**

- Modify: `src/app/t/[ticketNo]/page.tsx`

- [ ] **Step 1: Restyle VERIFIED/NOT VALID headers and ticket card — keep ALL DB logic, server rendering**

Replace the `not valid` return block:

```tsx
if (!valid || !bet) {
  return (
    <main className="mx-auto max-w-sm p-6 text-center">
      <div className="mb-4 rounded-lg bg-ca px-4 py-3">
        <h1 className="font-display text-2xl text-white">
          ✕ NOT A VALID TICKET
        </h1>
      </div>
      <p className="mt-2 text-ink/50">
        This QR code does not verify. The ticket may be forged.
      </p>
    </main>
  );
}
```

Replace the `verified` return block (after all DB queries):

```tsx
return (
  <main className="mx-auto max-w-sm p-6">
    <div className="mb-4 rounded-lg bg-mx px-4 py-3 text-center">
      <h1 className="font-display text-2xl text-white">✓ VERIFIED TICKET</h1>
    </div>
    <dl className="space-y-2 rounded-xl border border-dashed border-ink/30 bg-white p-4">
      <Row k="Ticket" v={bet.ticketNo} />
      <Row k="Player" v={player.displayName} />
      <Row
        k="Match"
        v={`${match.homeTeam} vs ${match.awayTeam} (${match.stage})`}
      />
      <Row k="Pick" v={`${pick} @ ${priceLabel(line.priceC)}`} />
      <Row k="Stake" v={`${bet.stakeMmk.toLocaleString()} MMK`} />
      <Row k="Score at bet" v={`${bet.scoreHomeAtBet}–${bet.scoreAwayAtBet}`} />
      <Row k="Placed" v={formatMmt(bet.placedAt)} />
      <Row k="Status" v={bet.status.toUpperCase()} />
      {bet.netMmk != null && (
        <Row k="Net" v={`${bet.netMmk.toLocaleString()} MMK`} />
      )}
      {settlement != null && <Row k="Settled" v={settlement.ref} />}
    </dl>
  </main>
);
```

Replace `Row` function:

```tsx
function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink/50">{k}</dt>
      <dd className="text-right font-medium text-ink">{v}</dd>
    </div>
  );
}
```

- [ ] **Step 2: Verify TS**

```bash
cd /mnt/hermes-data/mmzphyo/Projects/WorldBet2026 && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

---

## Task 13: Admin Layout

**Files:**

- Modify: `src/app/admin/layout.tsx`

- [ ] **Step 1: Restyle admin nav — keep ALL auth checks, I18nProvider, children**

Replace the `nav` className and Link className:

```tsx
return (
  <I18nProvider initial={me.language}>
    <nav className="relative flex gap-3 overflow-x-auto bg-ink p-3 text-sm font-semibold">
      {nav.map(([href, label]) => (
        <Link
          key={href}
          href={href}
          className="text-white/80 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
        >
          {label}
        </Link>
      ))}
      {/* Triband bottom border */}
      <div className="triband absolute bottom-0 left-0 right-0" />
    </nav>
    <div className="mx-auto max-w-md p-3">{children}</div>
  </I18nProvider>
);
```

- [ ] **Step 2: Verify TS**

```bash
cd /mnt/hermes-data/mmzphyo/Projects/WorldBet2026 && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

---

## Task 14: Final Verification

**Files:** None (verification only)

- [ ] **Step 1: Full TypeScript check**

```bash
cd /mnt/hermes-data/mmzphyo/Projects/WorldBet2026 && npx tsc --noEmit
```

Expected: exit 0, no errors.

- [ ] **Step 2: Lint check**

```bash
cd /mnt/hermes-data/mmzphyo/Projects/WorldBet2026 && npm run lint
```

Expected: 0 errors, 0 warnings (or only pre-existing warnings).

- [ ] **Step 3: Run vitest**

```bash
cd /mnt/hermes-data/mmzphyo/Projects/WorldBet2026 && npx vitest run
```

Expected: all tests green.

- [ ] **Step 4: Production build**

```bash
cd /mnt/hermes-data/mmzphyo/Projects/WorldBet2026 && npm run build 2>&1 | tail -20
```

Expected: "Route (app)" table shown, no errors.

- [ ] **Step 5: Commit**

```bash
cd /mnt/hermes-data/mmzphyo/Projects/WorldBet2026 && git add -A && git commit -m "feat: WC26-inspired design system — tri-band identity, Anton numerals"
```

Expected: commit created on branch `feature/live-betting`.
