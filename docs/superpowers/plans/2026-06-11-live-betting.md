# WorldBet2026 Live Betting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the mobile live-betting web app specified in `docs/superpowers/specs/2026-06-11-live-betting-design.md` — phone+PIN auth, admin-managed Asian handicap lines, version-locked live bets, signed QR tickets, per-match-day accounting.

**Architecture:** Next.js 16 App Router monolith; SQLite (better-sqlite3 + Drizzle ORM, WAL); SSE for live line pushes; pure-function grading engine; all money as integer MMK, Malay prices stored ×100, handicap balls stored in quarter-goal integer units.

**Tech Stack:** Next.js 16, TypeScript, Tailwind v4, Drizzle ORM, better-sqlite3, jose (session JWT), bcryptjs, qrcode, vitest.

**Conventions for every task:**

- Run tests with `npx vitest run <file>` from the repo root.
- Commit messages: conventional (`feat:`, `test:`, `chore:`).
- All amounts MMK integers. `priceC` = Malay price ×100 (e.g. `0.92` → `92`, `−0.98` → `−98`). `ballQ` = handicap ball ×4 (e.g. `0.75` → `3`). Odd `ballQ` = quarter-ball line.
- Times stored as UTC ISO strings; `match_day` is the kickoff date in Asia/Yangon.

---

## File structure

```
data/fixtures.json                 # 104 seeded fixtures
drizzle.config.ts                  # drizzle-kit config
vitest.config.ts
scripts/seed.ts                    # fixtures + settings seed
scripts/create-admin.ts            # first admin
src/lib/db/schema.ts               # all Drizzle tables
src/lib/db/index.ts                # db client (WAL)
src/lib/time.ts                    # MMT helpers, matchDay derivation
src/lib/engine/grade.ts            # pure grading engine (the money code)
src/lib/engine/grade.test.ts
src/lib/auth/phone.ts              # normalization
src/lib/auth/pin.ts                # bcrypt wrappers + lockout rules
src/lib/auth/session.ts            # jose cookie sessions, requirePlayer/requireAdmin
src/lib/sse.ts                     # in-process broadcast hub
src/lib/ticket/sign.ts             # HMAC ticket signatures (versioned secrets)
src/lib/ticket/ticketNo.ts         # WB-XXXXX generator
src/lib/bets/place.ts              # bet placement transaction (versions, limits, snapshot)
src/lib/bets/settleMatch.ts        # grade tickets on score confirm + day close
src/lib/accounting/queries.ts      # balances, settlement board, dashboard aggregates
src/lib/i18n/{en.ts,mm.ts,index.ts}
src/app/api/auth/{register,login,logout,change-pin}/route.ts
src/app/api/stream/route.ts        # SSE
src/app/api/bets/route.ts          # POST place bet
src/app/api/admin/{lines,scores,settle,players,invites,settings}/route.ts
src/app/(auth)/{login,register}/page.tsx
src/app/(player)/{page.tsx,bets/page.tsx,balance/page.tsx,profile/page.tsx}
src/app/t/[ticketNo]/page.tsx      # public QR verification
src/app/admin/{page.tsx,lines/page.tsx,scores/page.tsx,settle/page.tsx,players/page.tsx,settings/page.tsx}
src/components/...                 # per-screen components, listed in their tasks
```

Execution order is phased: **Phase A** foundation + engine (Tasks 1–6), **Phase B** auth (7–9), **Phase C** lines/SSE/bets/tickets (10–15), **Phase D** grading/accounting/admin (16–20), **Phase E** player UI + i18n + deploy (21–24). Every phase ends with working, tested software.

---

### Task 1: Dependencies, env, test runner

**Files:**

- Modify: `package.json` (via npm install)
- Create: `vitest.config.ts`, `.env.local`, `.env.example`
- Modify: `.gitignore`

- [ ] **Step 1: Install dependencies**

```bash
npm i drizzle-orm better-sqlite3 jose bcryptjs qrcode
npm i -D drizzle-kit vitest @types/better-sqlite3 @types/bcryptjs @types/qrcode tsx
```

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts"] },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
```

- [ ] **Step 3: Create `.env.example` (commit) and `.env.local` (do not commit)**

```bash
# .env.example — copy to .env.local and fill
DATABASE_PATH=./worldbet.db
SESSION_SECRET=change-me-32-bytes-minimum-random
# comma-separated, position = key version (v1 first)
TICKET_SECRETS=change-me-ticket-secret-v1
```

For `.env.local`, generate real values: `openssl rand -hex 32` for each secret.

- [ ] **Step 4: Ignore DB artifacts** — append to `.gitignore`:

```
worldbet.db*
*.db-journal
```

- [ ] **Step 5: Verify and commit**

Run: `npx vitest run` → Expected: "No test files found" exit 0 (or pass with 0 tests).

```bash
git add package.json package-lock.json vitest.config.ts .env.example .gitignore
git commit -m "chore: deps, env template, vitest"
```

### Task 2: Drizzle schema and db client

**Files:**

- Create: `src/lib/db/schema.ts`, `src/lib/db/index.ts`, `drizzle.config.ts`
- Test: `src/lib/db/db.test.ts`

- [ ] **Step 1: Write `src/lib/db/schema.ts`** — every table from spec §5:

```ts
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const players = sqliteTable("players", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  phone: text("phone").notNull().unique(),
  pinHash: text("pin_hash").notNull(),
  displayName: text("display_name").notNull(),
  role: text("role", { enum: ["player", "admin"] })
    .notNull()
    .default("player"),
  language: text("language", { enum: ["en", "mm"] })
    .notNull()
    .default("en"),
  failedPinAttempts: integer("failed_pin_attempts").notNull().default(0),
  lockedUntil: text("locked_until"),
  mustChangePin: integer("must_change_pin", { mode: "boolean" })
    .notNull()
    .default(false),
  sessionEpoch: integer("session_epoch").notNull().default(0), // bump to kill sessions
  createdAt: text("created_at").notNull(),
});

export const inviteCodes = sqliteTable("invite_codes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull().unique(),
  maxUses: integer("max_uses").notNull(),
  usedCount: integer("used_count").notNull().default(0),
  expiresAt: text("expires_at").notNull(),
  createdBy: integer("created_by")
    .notNull()
    .references(() => players.id),
});

export const matches = sqliteTable("matches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  stage: text("stage").notNull(), // "Group A" | "R32" | ...
  homeTeam: text("home_team").notNull(), // "BRA" or "Winner A" placeholder
  awayTeam: text("away_team").notNull(),
  kickoffUtc: text("kickoff_utc").notNull(),
  venue: text("venue").notNull(),
  matchDay: text("match_day").notNull(), // YYYY-MM-DD in MMT
  status: text("status", { enum: ["scheduled", "live", "finished"] })
    .notNull()
    .default("scheduled"),
  homeScore: integer("home_score"),
  awayScore: integer("away_score"),
  scoreConfirmedAt: text("score_confirmed_at"),
  betLimitMmk: integer("bet_limit_mmk"), // null = no carve-out, uses daily pool
  externalApiId: text("external_api_id"),
});

export const lines = sqliteTable("lines", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  matchId: integer("match_id")
    .notNull()
    .references(() => matches.id),
  version: integer("version").notNull(),
  favSide: text("fav_side", { enum: ["home", "away"] }).notNull(),
  ballQ: integer("ball_q").notNull(), // ball ×4, ≥ 0
  priceC: integer("price_c").notNull(), // Malay ×100, −100..100, ≠0
  status: text("status", { enum: ["active", "suspended", "closed"] }).notNull(),
  postedBy: integer("posted_by")
    .notNull()
    .references(() => players.id),
  postedAt: text("posted_at").notNull(),
});

export const bets = sqliteTable("bets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticketNo: text("ticket_no").notNull().unique(),
  playerId: integer("player_id")
    .notNull()
    .references(() => players.id),
  matchId: integer("match_id")
    .notNull()
    .references(() => matches.id),
  lineId: integer("line_id")
    .notNull()
    .references(() => lines.id),
  side: text("side", { enum: ["fav", "dog"] }).notNull(),
  stakeMmk: integer("stake_mmk").notNull(),
  scoreHomeAtBet: integer("score_home_at_bet").notNull(),
  scoreAwayAtBet: integer("score_away_at_bet").notNull(),
  placedAt: text("placed_at").notNull(),
  status: text("status", {
    enum: ["pending", "won", "half_won", "push", "half_lost", "lost", "void"],
  })
    .notNull()
    .default("pending"),
  netMmk: integer("net_mmk"),
  settledAt: text("settled_at"),
  settlementId: integer("settlement_id"),
  voidedBy: integer("voided_by"),
  voidReason: text("void_reason"),
});

export const matchDays = sqliteTable("match_days", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull().unique(), // YYYY-MM-DD MMT
  status: text("status", { enum: ["open", "closed", "settled"] })
    .notNull()
    .default("open"),
  closedAt: text("closed_at"),
});

export const settlements = sqliteTable("settlements", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ref: text("ref").notNull().unique(), // S-MMDD-NN
  matchDayId: integer("match_day_id")
    .notNull()
    .references(() => matchDays.id),
  playerId: integer("player_id")
    .notNull()
    .references(() => players.id),
  netMmk: integer("net_mmk").notNull(),
  markedBy: integer("marked_by")
    .notNull()
    .references(() => players.id),
  markedAt: text("marked_at").notNull(),
});

export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey(), // always 1
  dailyTotalLimitMmk: integer("daily_total_limit_mmk").notNull().default(0), // 0 = unlimited
});

export const auditLog = sqliteTable("audit_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  actorId: integer("actor_id").notNull(),
  action: text("action").notNull(), // pin_reset | void | score_correction | limit_change | unlock | grant_admin
  subject: text("subject").notNull(),
  detail: text("detail"),
  at: text("at").notNull(),
});
```

- [ ] **Step 2: Write `src/lib/db/index.ts`** — client with WAL, test-overridable path:

```ts
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  __db?: ReturnType<typeof create>;
};

function create(path = process.env.DATABASE_PATH ?? "./worldbet.db") {
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return drizzle(sqlite, { schema });
}

export function getDb() {
  if (!globalForDb.__db) globalForDb.__db = create();
  return globalForDb.__db;
}

/** Tests: fresh in-memory db with schema applied. */
export function createTestDb() {
  const db = create(":memory:");
  applyMigrations(db);
  return db;
}

import { migrate } from "drizzle-orm/better-sqlite3/migrator";
export function applyMigrations(db: ReturnType<typeof create>) {
  migrate(db, { migrationsFolder: "./drizzle" });
}

export { schema };
export type Db = ReturnType<typeof create>;
```

- [ ] **Step 3: Create `drizzle.config.ts` and generate the migration**

```ts
import { defineConfig } from "drizzle-kit";
export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: { url: process.env.DATABASE_PATH ?? "./worldbet.db" },
});
```

Run: `npx drizzle-kit generate` → Expected: SQL migration created under `drizzle/`.

- [ ] **Step 4: Write failing test `src/lib/db/db.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { createTestDb, schema } from "./index";

describe("db schema", () => {
  it("round-trips a player and enforces unique phone", () => {
    const db = createTestDb();
    db.insert(schema.players)
      .values({
        phone: "09790001111",
        pinHash: "x",
        displayName: "Ko Zaw",
        createdAt: new Date().toISOString(),
      })
      .run();
    const all = db.select().from(schema.players).all();
    expect(all).toHaveLength(1);
    expect(() =>
      db
        .insert(schema.players)
        .values({
          phone: "09790001111",
          pinHash: "y",
          displayName: "Dup",
          createdAt: new Date().toISOString(),
        })
        .run(),
    ).toThrow(/UNIQUE/);
  });
});
```

- [ ] **Step 5: Run test** — `npx vitest run src/lib/db/db.test.ts` → Expected: PASS (schema + migration work end-to-end). If it fails on migration folder, re-check Step 3 output exists.

- [ ] **Step 6: Commit**

```bash
git add src/lib/db drizzle drizzle.config.ts
git commit -m "feat: drizzle schema, db client, initial migration"
```

### Task 3: Time helpers (Myanmar match days)

**Files:**

- Create: `src/lib/time.ts`
- Test: `src/lib/time.test.ts`

- [ ] **Step 1: Write failing test `src/lib/time.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { matchDayOf, formatMmt } from "./time";

describe("time", () => {
  it("derives match_day from kickoff in Asia/Yangon", () => {
    // 2026-06-11 19:30 UTC = 2026-06-12 02:00 MMT → match day 2026-06-12
    expect(matchDayOf("2026-06-11T19:30:00Z")).toBe("2026-06-12");
    // 2026-06-11 17:00 UTC = 2026-06-11 23:30 MMT → stays 2026-06-11
    expect(matchDayOf("2026-06-11T17:00:00Z")).toBe("2026-06-11");
  });
  it("formats display time in MMT", () => {
    expect(formatMmt("2026-06-11T19:30:00Z")).toMatch(/12 Jun.*02:00/);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/time.test.ts` → Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/lib/time.ts`**

```ts
const MMT = "Asia/Yangon";

export function matchDayOf(utcIso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: MMT,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(utcIso)); // en-CA gives YYYY-MM-DD
}

export function formatMmt(utcIso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: MMT,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(utcIso));
}

export function nowIso(): string {
  return new Date().toISOString();
}
```

- [ ] **Step 4: Run** → Expected: PASS.

- [ ] **Step 5: Commit** — `git add src/lib/time*; git commit -m "feat: MMT time helpers"`

### Task 4: Grading engine (the money code)

**Files:**

- Create: `src/lib/engine/grade.ts`
- Test: `src/lib/engine/grade.test.ts`

Semantics (spec §10): effective score = final − at-bet. Margin in quarter units for fav bet: `m = 4*(effFav − effDog) − ballQ`; dog bet: `m = ballQ − 4*(effFav − effDog)`. Quarter lines (odd ballQ) split stake S/2 on ballQ−1 and ballQ+1. Malay payout: `priceC > 0`: win `+S*priceC/100`, lose `−S`; `priceC < 0`: win `+S`, lose `−S*|priceC|/100`.

- [ ] **Step 1: Write the failing test — exhaustive, hand-computed table**

```ts
import { describe, it, expect } from "vitest";
import { gradeBet } from "./grade";

type Case = {
  name: string;
  side: "fav" | "dog";
  ballQ: number;
  priceC: number;
  stake: number;
  effFav: number;
  effDog: number;
  status: string;
  net: number;
};

const T: Case[] = [
  // ---- full ball (ballQ multiple of 4): pushes possible
  {
    name: "fav -1.0 wins by 2",
    side: "fav",
    ballQ: 4,
    priceC: 92,
    stake: 100_000,
    effFav: 2,
    effDog: 0,
    status: "won",
    net: 92_000,
  },
  {
    name: "fav -1.0 wins by 1 → push",
    side: "fav",
    ballQ: 4,
    priceC: 92,
    stake: 100_000,
    effFav: 1,
    effDog: 0,
    status: "push",
    net: 0,
  },
  {
    name: "fav -1.0 draws → lost",
    side: "fav",
    ballQ: 4,
    priceC: 92,
    stake: 100_000,
    effFav: 0,
    effDog: 0,
    status: "lost",
    net: -100_000,
  },
  {
    name: "dog +1.0 loses by 1 → push",
    side: "dog",
    ballQ: 4,
    priceC: -98,
    stake: 100_000,
    effFav: 1,
    effDog: 0,
    status: "push",
    net: 0,
  },
  {
    name: "dog +1.0 draws → won (neg price wins stake)",
    side: "dog",
    ballQ: 4,
    priceC: -98,
    stake: 100_000,
    effFav: 0,
    effDog: 0,
    status: "won",
    net: 100_000,
  },
  {
    name: "dog +1.0 loses by 2 → lost (neg price)",
    side: "dog",
    ballQ: 4,
    priceC: -98,
    stake: 100_000,
    effFav: 2,
    effDog: 0,
    status: "lost",
    net: -98_000,
  },

  // ---- half ball (ballQ ≡ 2 mod 4): no pushes
  {
    name: "fav -0.5 wins by 1",
    side: "fav",
    ballQ: 2,
    priceC: 85,
    stake: 200_000,
    effFav: 1,
    effDog: 0,
    status: "won",
    net: 170_000,
  },
  {
    name: "fav -0.5 draws → lost",
    side: "fav",
    ballQ: 2,
    priceC: 85,
    stake: 200_000,
    effFav: 0,
    effDog: 0,
    status: "lost",
    net: -200_000,
  },
  {
    name: "dog +0.5 draws → won",
    side: "dog",
    ballQ: 2,
    priceC: -95,
    stake: 300_000,
    effFav: 0,
    effDog: 0,
    status: "won",
    net: 300_000,
  },
  {
    name: "dog +0.5 loses by 1 → lost",
    side: "dog",
    ballQ: 2,
    priceC: -95,
    stake: 300_000,
    effFav: 1,
    effDog: 0,
    status: "lost",
    net: -285_000,
  },

  // ---- quarter ball: split halves
  // fav -0.75 @0.92, stake 100k, wins by 1: half -0.5 wins (+46,000), half -1.0 pushes → half_won
  {
    name: "fav -0.75 wins by 1 → half_won",
    side: "fav",
    ballQ: 3,
    priceC: 92,
    stake: 100_000,
    effFav: 1,
    effDog: 0,
    status: "half_won",
    net: 46_000,
  },
  {
    name: "fav -0.75 wins by 2 → won",
    side: "fav",
    ballQ: 3,
    priceC: 92,
    stake: 100_000,
    effFav: 2,
    effDog: 0,
    status: "won",
    net: 92_000,
  },
  {
    name: "fav -0.75 draws → lost",
    side: "fav",
    ballQ: 3,
    priceC: 92,
    stake: 100_000,
    effFav: 0,
    effDog: 0,
    status: "lost",
    net: -100_000,
  },
  // fav -0.25 @-0.90, stake 100k, draw: half 0 pushes, half -0.5 loses 45,000 → half_lost
  {
    name: "fav -0.25 neg price draws → half_lost",
    side: "fav",
    ballQ: 1,
    priceC: -90,
    stake: 100_000,
    effFav: 0,
    effDog: 0,
    status: "half_lost",
    net: -45_000,
  },
  // dog +0.25 @-0.98 draw: half +0 pushes, half +0.5 wins 50,000 → half_won
  {
    name: "dog +0.25 neg price draws → half_won",
    side: "dog",
    ballQ: 1,
    priceC: -98,
    stake: 100_000,
    effFav: 0,
    effDog: 0,
    status: "half_won",
    net: 50_000,
  },
  {
    name: "dog +0.25 loses by 1 → lost",
    side: "dog",
    ballQ: 1,
    priceC: -98,
    stake: 100_000,
    effFav: 1,
    effDog: 0,
    status: "lost",
    net: -98_000,
  },

  // ---- live bet: effective score already offset by caller; same math
  // bet at 1-0 on dog +0.75 @0.90, final 2-1 → eff 1-1, diff 0 →
  // halves +0.5 and +1.0 both win; priceC 90 > 0 so each pays S/2 × 0.90 = 45,000 → won, +90,000
  {
    name: "live dog +0.75 eff draw → won",
    side: "dog",
    ballQ: 3,
    priceC: 90,
    stake: 100_000,
    effFav: 1,
    effDog: 1,
    status: "won",
    net: 90_000,
  },

  // ---- ball 0 (level): pure push possibilities
  {
    name: "level ball draw → push",
    side: "fav",
    ballQ: 0,
    priceC: 95,
    stake: 50_000,
    effFav: 1,
    effDog: 1,
    status: "push",
    net: 0,
  },

  // ---- odd stake rounding: half stakes round half-away-from-zero once at the end
  {
    name: "quarter ball odd stake rounds",
    side: "fav",
    ballQ: 3,
    priceC: 85,
    stake: 33_333,
    effFav: 1,
    effDog: 0,
    status: "half_won",
    net: 14_167,
  }, // 16666.5*0.85 = 14166.525 → 14167? see grade.ts rounding note
];

describe("gradeBet", () => {
  for (const c of T) {
    it(c.name, () => {
      const r = gradeBet({
        side: c.side,
        ballQ: c.ballQ,
        priceC: c.priceC,
        stake: c.stake,
        effFav: c.effFav,
        effDog: c.effDog,
      });
      expect(r.status).toBe(c.status);
      expect(r.netMmk).toBe(c.net);
    });
  }

  it("rejects invalid inputs", () => {
    expect(() =>
      gradeBet({
        side: "fav",
        ballQ: -1,
        priceC: 92,
        stake: 1000,
        effFav: 0,
        effDog: 0,
      }),
    ).toThrow();
    expect(() =>
      gradeBet({
        side: "fav",
        ballQ: 0,
        priceC: 0,
        stake: 1000,
        effFav: 0,
        effDog: 0,
      }),
    ).toThrow();
    expect(() =>
      gradeBet({
        side: "fav",
        ballQ: 0,
        priceC: 92,
        stake: 0,
        effFav: 0,
        effDog: 0,
      }),
    ).toThrow();
  });
});
```

Note on the odd-stake case: net is computed in exact fractions and rounded **once** at the end: `16666.5 × 0.85 = 14166.525 → 14167` (half away from zero). The engine must NOT round each half separately.

- [ ] **Step 2: Run** `npx vitest run src/lib/engine/grade.test.ts` → Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/lib/engine/grade.ts`**

```ts
export type GradeInput = {
  side: "fav" | "dog";
  ballQ: number; // handicap ×4, integer ≥ 0
  priceC: number; // Malay price ×100, integer, −100 ≤ p ≤ 100, p ≠ 0
  stake: number; // MMK, integer > 0
  effFav: number; // favorite's goals counted for this bet
  effDog: number;
};

export type GradeResult = {
  status: "won" | "half_won" | "push" | "half_lost" | "lost";
  netMmk: number;
};

type HalfOutcome = "win" | "push" | "lose";

function halfOutcome(
  side: "fav" | "dog",
  ballQ: number,
  effFav: number,
  effDog: number,
): HalfOutcome {
  const diffQ = 4 * (effFav - effDog);
  const m = side === "fav" ? diffQ - ballQ : ballQ - diffQ;
  return m > 0 ? "win" : m === 0 ? "push" : "lose";
}

/** Exact (unrounded) net for a half-stake with Malay price. */
function halfNet(
  outcome: HalfOutcome,
  halfStake: number,
  priceC: number,
): number {
  if (outcome === "push") return 0;
  if (priceC > 0)
    return outcome === "win" ? (halfStake * priceC) / 100 : -halfStake;
  return outcome === "win" ? halfStake : -(halfStake * -priceC) / 100;
}

function roundHalfAwayFromZero(x: number): number {
  return Math.sign(x) * Math.round(Math.abs(x));
}

export function gradeBet(i: GradeInput): GradeResult {
  if (!Number.isInteger(i.ballQ) || i.ballQ < 0)
    throw new Error("invalid ballQ");
  if (
    !Number.isInteger(i.priceC) ||
    i.priceC === 0 ||
    i.priceC < -100 ||
    i.priceC > 100
  )
    throw new Error("invalid priceC");
  if (!Number.isInteger(i.stake) || i.stake <= 0)
    throw new Error("invalid stake");
  if (
    !Number.isInteger(i.effFav) ||
    !Number.isInteger(i.effDog) ||
    i.effFav < 0 ||
    i.effDog < 0
  )
    throw new Error("invalid effective score");

  const quarter = i.ballQ % 2 === 1;
  const parts: Array<{ ballQ: number; stake: number }> = quarter
    ? [
        { ballQ: i.ballQ - 1, stake: i.stake / 2 },
        { ballQ: i.ballQ + 1, stake: i.stake / 2 },
      ]
    : [{ ballQ: i.ballQ, stake: i.stake }];

  const outcomes = parts.map((p) =>
    halfOutcome(i.side, p.ballQ, i.effFav, i.effDog),
  );
  const exactNet = parts.reduce(
    (sum, p, k) => sum + halfNet(outcomes[k], p.stake, i.priceC),
    0,
  );
  const netMmk = roundHalfAwayFromZero(exactNet);

  const wins = outcomes.filter((o) => o === "win").length;
  const loses = outcomes.filter((o) => o === "lose").length;
  const n = outcomes.length;

  let status: GradeResult["status"];
  if (wins === n) status = "won";
  else if (loses === n) status = "lost";
  else if (wins > 0) status = "half_won";
  else if (loses > 0) status = "half_lost";
  else status = "push";

  return { status, netMmk };
}
```

- [ ] **Step 4: Run** → Expected: PASS, all table rows green. If the odd-stake row fails by 1 MMK, the implementation is rounding per-half — fix to round once (see Step 1 note), not the test.

- [ ] **Step 5: Commit** — `git add src/lib/engine; git commit -m "feat: AH grading engine with exhaustive table"`

### Task 5: Fixtures dataset and seed script

**Files:**

- Create: `data/fixtures.json`, `scripts/seed.ts`
- Modify: `package.json` (scripts)

- [ ] **Step 1: Build `data/fixtures.json`** — all 104 WC2026 fixtures. Schema per entry:

```json
{
  "stage": "Group A",
  "home": "MEX",
  "away": "RSA",
  "kickoffUtc": "2026-06-11T19:00:00Z",
  "venue": "Estadio Azteca, Mexico City"
}
```

Populate the 72 group-stage entries from FIFA's published schedule (use WebSearch/WebFetch for "FIFA World Cup 2026 match schedule" at implementation time — do NOT invent kickoff times). Knockout entries (R32 through Final, 32 entries) use FIFA's published slot times with placeholder team labels exactly as printed in the official schedule (e.g. `"home": "1A", "away": "3C/D/F"`). **Acceptance check:** `node -e "console.log(require('./data/fixtures.json').length)"` prints `104`; group entries per group = 6 × 12 groups.

- [ ] **Step 2: Write `scripts/seed.ts`** — idempotent (skips if matches exist):

```ts
import { getDb, schema } from "../src/lib/db/index";
import { matchDayOf } from "../src/lib/time";
import fixtures from "../data/fixtures.json";

const db = getDb();
const existing = db.select().from(schema.matches).all();
if (existing.length > 0) {
  console.log(`matches already seeded (${existing.length}), skipping`);
} else {
  for (const f of fixtures as Array<{
    stage: string;
    home: string;
    away: string;
    kickoffUtc: string;
    venue: string;
  }>) {
    db.insert(schema.matches)
      .values({
        stage: f.stage,
        homeTeam: f.home,
        awayTeam: f.away,
        kickoffUtc: f.kickoffUtc,
        venue: f.venue,
        matchDay: matchDayOf(f.kickoffUtc),
      })
      .run();
  }
  console.log(`seeded ${fixtures.length} matches`);
}
db.insert(schema.settings)
  .values({ id: 1, dailyTotalLimitMmk: 0 })
  .onConflictDoNothing()
  .run();
console.log("settings ensured");
```

- [ ] **Step 3: Write `scripts/create-admin.ts`**

```ts
import bcrypt from "bcryptjs";
import { getDb, schema } from "../src/lib/db/index";
import { normalizePhone } from "../src/lib/auth/phone";

const [phone, pin, name] = process.argv.slice(2);
if (!phone || !/^\d{6}$/.test(pin ?? "") || !name) {
  console.error(
    "usage: npx tsx scripts/create-admin.ts <phone> <6-digit-pin> <name>",
  );
  process.exit(1);
}
const db = getDb();
db.insert(schema.players)
  .values({
    phone: normalizePhone(phone),
    pinHash: bcrypt.hashSync(pin, 10),
    displayName: name,
    role: "admin",
    createdAt: new Date().toISOString(),
  })
  .run();
console.log("admin created");
```

(`normalizePhone` is implemented in Task 6 — run Task 6 before executing this script; it compiles fine on creation.)

- [ ] **Step 4: Add npm scripts** to `package.json`:

```json
"db:migrate": "drizzle-kit migrate",
"db:seed": "tsx scripts/seed.ts",
"db:create-admin": "tsx scripts/create-admin.ts",
"test": "vitest run"
```

- [ ] **Step 5: Verify** — `npm run db:migrate && npm run db:seed` → Expected: `seeded 104 matches`, re-run prints `matches already seeded (104), skipping`.

- [ ] **Step 6: Commit** — `git add data scripts package.json; git commit -m "feat: fixtures dataset + seed/create-admin scripts"`

### Task 6: Phone normalization and PIN rules

**Files:**

- Create: `src/lib/auth/phone.ts`, `src/lib/auth/pin.ts`
- Test: `src/lib/auth/phone.test.ts`, `src/lib/auth/pin.test.ts`

- [ ] **Step 1: Failing test `src/lib/auth/phone.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { normalizePhone } from "./phone";

describe("normalizePhone", () => {
  it("treats 09x, +959x, 959x, spaced/dashed as one identity", () => {
    expect(normalizePhone("09790001111")).toBe("09790001111");
    expect(normalizePhone("+959790001111")).toBe("09790001111");
    expect(normalizePhone("959790001111")).toBe("09790001111");
    expect(normalizePhone("09 790 001 111")).toBe("09790001111");
    expect(normalizePhone("09-790-001-111")).toBe("09790001111");
  });
  it("rejects garbage", () => {
    for (const bad of ["", "123", "abc", "0812345", "0979000111122334"]) {
      expect(() => normalizePhone(bad)).toThrow();
    }
  });
});
```

- [ ] **Step 2: Run → FAIL. Implement `src/lib/auth/phone.ts`**

```ts
/**
 * Normalize Myanmar mobile numbers to canonical 09xxxxxxxxx form.
 * Accepted forms: 09…, +959…, 959… (spaces/dashes anywhere; '+' only as first char).
 * Note: bare '959…' is treated as country-code form; this is the common typed form
 * here. Bare '9…' (without 0 or 95) is rejected as ambiguous.
 */
export function normalizePhone(raw: string): string {
  const s = raw.replace(/[\s\-]/g, "");
  const m = /^(?:\+?959|09)(\d{7,10})$/.exec(s);
  if (!m) throw new Error("invalid phone");
  return "09" + m[1];
}
```

- [ ] **Step 3: Failing test `src/lib/auth/pin.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import {
  hashPin,
  verifyPin,
  lockState,
  registerFailure,
  LOCK_MINUTES,
  MAX_ATTEMPTS,
} from "./pin";

describe("pin", () => {
  it("hashes and verifies", () => {
    const h = hashPin("123456");
    expect(verifyPin("123456", h)).toBe(true);
    expect(verifyPin("654321", h)).toBe(false);
    expect(() => hashPin("12345")).toThrow(); // must be exactly 6 digits
    expect(() => hashPin("abcdef")).toThrow();
  });
  it("locks after MAX_ATTEMPTS failures for LOCK_MINUTES", () => {
    let p = { failedPinAttempts: 0, lockedUntil: null as string | null };
    for (let k = 0; k < MAX_ATTEMPTS; k++)
      p = registerFailure(p, "2026-06-12T10:00:00Z");
    expect(p.failedPinAttempts).toBe(MAX_ATTEMPTS);
    expect(p.lockedUntil).toBe(
      new Date(
        Date.parse("2026-06-12T10:00:00Z") + LOCK_MINUTES * 60_000,
      ).toISOString(),
    );
    expect(lockState(p, "2026-06-12T10:05:00Z").locked).toBe(true);
    expect(lockState(p, "2026-06-12T10:16:00Z").locked).toBe(false);
  });
});
```

- [ ] **Step 4: Run → FAIL. Implement `src/lib/auth/pin.ts`**

```ts
import bcrypt from "bcryptjs";

export const MAX_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;

export function hashPin(pin: string): string {
  if (!/^\d{6}$/.test(pin)) throw new Error("PIN must be exactly 6 digits");
  return bcrypt.hashSync(pin, 10);
}

export function verifyPin(pin: string, hash: string): boolean {
  return bcrypt.compareSync(pin, hash);
}

// NOTE: a 6-digit PIN (10^6 keyspace) is trivially brute-forced offline at any
// bcrypt cost if pin_hash leaks. The real defense is the online lockout below;
// cost 10 just keeps casual inspection out.
//
// Caller contract: check lockState() BEFORE verifyPin(); do not call
// registerFailure() while locked (it would extend the lock); call
// registerSuccess() fields on successful login.

export type LockFields = {
  failedPinAttempts: number;
  lockedUntil: string | null;
};

export function registerFailure(p: LockFields, nowIso: string): LockFields {
  const lockExpired =
    !!p.lockedUntil && Date.parse(p.lockedUntil) <= Date.parse(nowIso);
  const failed = (lockExpired ? 0 : p.failedPinAttempts) + 1;
  return {
    failedPinAttempts: failed,
    lockedUntil:
      failed >= MAX_ATTEMPTS
        ? new Date(Date.parse(nowIso) + LOCK_MINUTES * 60_000).toISOString()
        : lockExpired
          ? null
          : p.lockedUntil,
  };
}

export function registerSuccess(): LockFields {
  return { failedPinAttempts: 0, lockedUntil: null };
}

export function lockState(p: LockFields, nowIso: string): { locked: boolean } {
  return {
    locked: !!p.lockedUntil && Date.parse(p.lockedUntil) > Date.parse(nowIso),
  };
}
```

- [ ] **Step 5: Run both → PASS. Commit** — `git add src/lib/auth; git commit -m "feat: phone normalization, pin hashing + lockout rules"`

### Task 7: Sessions (jose JWT cookie)

**Files:**

- Create: `src/lib/auth/session.ts`
- Test: `src/lib/auth/session.test.ts`

- [ ] **Step 1: Failing test `src/lib/auth/session.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SignJWT } from "jose";
import { createSessionToken, verifySessionToken } from "./session";

describe("session tokens", () => {
  let originalSecret: string | undefined;

  beforeEach(() => {
    originalSecret = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = "test-secret-test-secret-test-secret!";
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.SESSION_SECRET;
    } else {
      process.env.SESSION_SECRET = originalSecret;
    }
  });

  it("round-trips and respects sessionEpoch", async () => {
    const tok = await createSessionToken({
      playerId: 7,
      role: "admin",
      epoch: 2,
    });
    const s = await verifySessionToken(tok);
    expect(s).toEqual({ playerId: 7, role: "admin", epoch: 2 });
    expect(await verifySessionToken(tok + "x")).toBeNull();
  });

  it("rejects expired tokens", async () => {
    const tok = await new SignJWT({ playerId: 7, role: "player", epoch: 0 })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("-10s")
      .sign(new TextEncoder().encode(process.env.SESSION_SECRET!));
    expect(await verifySessionToken(tok)).toBeNull();
  });

  it("rejects tokens signed with a different secret", async () => {
    process.env.SESSION_SECRET = "wrong-secret-wrong-secret-wrong-secret";
    const tok = await createSessionToken({
      playerId: 7,
      role: "player",
      epoch: 0,
    });
    process.env.SESSION_SECRET = "test-secret-test-secret-test-secret!";
    expect(await verifySessionToken(tok)).toBeNull();
  });

  it("rejects wrong-typed claims", async () => {
    const tok = await new SignJWT({ playerId: "7", role: "player", epoch: 0 })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("30d")
      .sign(new TextEncoder().encode(process.env.SESSION_SECRET!));
    expect(await verifySessionToken(tok)).toBeNull();
  });
});
```

- [ ] **Step 2: Run → FAIL. Implement `src/lib/auth/session.ts`**

```ts
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

export type Session = {
  playerId: number;
  role: "player" | "admin";
  epoch: number;
};
const COOKIE = "wb_session";
const THIRTY_DAYS = 60 * 60 * 24 * 30;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32)
    throw new Error("SESSION_SECRET must be set (>= 32 chars)");
  return new TextEncoder().encode(s);
}

export async function createSessionToken(s: Session): Promise<string> {
  return new SignJWT(s as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${THIRTY_DAYS}s`)
    .sign(secret());
}

export async function verifySessionToken(tok: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(tok, secret(), {
      algorithms: ["HS256"],
    });
    if (
      typeof payload.playerId !== "number" ||
      typeof payload.epoch !== "number" ||
      (payload.role !== "player" && payload.role !== "admin")
    )
      return null;
    return {
      playerId: payload.playerId,
      role: payload.role,
      epoch: payload.epoch,
    };
  } catch {
    return null;
  }
}

export async function setSessionCookie(s: Session) {
  (await cookies()).set(COOKIE, await createSessionToken(s), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: THIRTY_DAYS,
    path: "/",
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(COOKIE);
}

/** Returns the player row or null. Epoch mismatch (PIN reset) = invalid. */
export async function currentPlayer() {
  const tok = (await cookies()).get(COOKIE)?.value;
  if (!tok) return null;
  const s = await verifySessionToken(tok);
  if (!s) return null;
  const db = getDb();
  const p = db
    .select()
    .from(schema.players)
    .where(eq(schema.players.id, s.playerId))
    .get();
  if (!p || p.sessionEpoch !== s.epoch) return null;
  return p;
}

export async function requirePlayer() {
  const p = await currentPlayer();
  if (!p) throw Object.assign(new Error("unauthorized"), { httpStatus: 401 });
  return p;
}

export async function requireAdmin() {
  const p = await requirePlayer();
  if (p.role !== "admin")
    throw Object.assign(new Error("forbidden"), { httpStatus: 403 });
  return p;
}
```

- [ ] **Step 3: Run → PASS** (the test exercises only the token functions; cookie helpers run inside route handlers).

- [ ] **Step 4: Commit** — `git add src/lib/auth/session*; git commit -m "fix: session secret validation, claim shape checks, dev-safe secure cookie"`

### Task 8: Auth API routes (register, login, logout, change-pin)

**Files:**

- Create: `src/app/api/auth/register/route.ts`, `src/app/api/auth/login/route.ts`, `src/app/api/auth/logout/route.ts`, `src/app/api/auth/change-pin/route.ts`
- Create: `src/lib/api.ts` (shared JSON/error helper)
- Test: `src/lib/auth/authFlows.test.ts` (logic extracted to testable functions)

Route handlers stay thin; the testable logic lives in `src/lib/auth/flows.ts`.

- [ ] **Step 1: Create `src/lib/api.ts`**

```ts
import { NextResponse } from "next/server";

export function ok(data: unknown, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

export function fail(
  code: string,
  message: string,
  status = 400,
  extra?: Record<string, unknown>,
) {
  return NextResponse.json({ ok: false, code, message, ...extra }, { status });
}

export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    const status = (e as { httpStatus?: number }).httpStatus ?? 500;
    const msg = e instanceof Error ? e.message : "error";
    return fail(status === 500 ? "internal" : msg, msg, status);
  }
}
```

- [ ] **Step 2: Failing test `src/lib/auth/authFlows.test.ts`**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, schema, type Db } from "@/lib/db";
import { registerPlayer, loginPlayer, changePin } from "./flows";
import { hashPin } from "./pin";

let db: Db;
const NOW = "2026-06-12T10:00:00Z";

beforeEach(() => {
  db = createTestDb();
  db.insert(schema.players)
    .values({
      phone: "09700000001",
      pinHash: hashPin("111111"),
      displayName: "Admin",
      role: "admin",
      createdAt: NOW,
    })
    .run();
  db.insert(schema.inviteCodes)
    .values({
      code: "JOIN26",
      maxUses: 5,
      usedCount: 0,
      expiresAt: "2026-12-31T00:00:00Z",
      createdBy: 1,
    })
    .run();
});

describe("registerPlayer", () => {
  it("happy path consumes invite and normalizes phone", () => {
    const p = registerPlayer(
      db,
      { code: "JOIN26", phone: "+959790001111", name: "Ko Zaw", pin: "222222" },
      NOW,
    );
    expect(p.phone).toBe("09790001111");
    expect(db.select().from(schema.inviteCodes).all()[0].usedCount).toBe(1);
  });
  it("rejects expired/exhausted/unknown codes and duplicate phones", () => {
    expect(() =>
      registerPlayer(
        db,
        { code: "NOPE", phone: "09790001111", name: "X", pin: "222222" },
        NOW,
      ),
    ).toThrow(/invite/);
    registerPlayer(
      db,
      { code: "JOIN26", phone: "09790001111", name: "X", pin: "222222" },
      NOW,
    );
    expect(() =>
      registerPlayer(
        db,
        { code: "JOIN26", phone: "0979 000 1111", name: "Y", pin: "333333" },
        NOW,
      ),
    ).toThrow(/already/);
    expect(() =>
      registerPlayer(
        db,
        { code: "JOIN26", phone: "09790001112", name: "Z", pin: "4444" },
        NOW,
      ),
    ).toThrow(/PIN/);
  });
});

describe("loginPlayer", () => {
  it("succeeds, resets failure count, fails wrong pin, locks after 5", () => {
    expect(
      loginPlayer(db, "09700000001", "111111", NOW).player.displayName,
    ).toBe("Admin");
    for (let k = 0; k < 5; k++) {
      expect(() => loginPlayer(db, "09700000001", "999999", NOW)).toThrow();
    }
    // locked now, even with the right PIN
    expect(() => loginPlayer(db, "09700000001", "111111", NOW)).toThrow(
      /locked/,
    );
    // after lock expires it works and clears counters
    const later = "2026-06-12T10:20:00Z";
    expect(
      loginPlayer(db, "09700000001", "111111", later).player.failedPinAttempts,
    ).toBe(0);
  });
});

describe("changePin", () => {
  it("requires current pin, bumps sessionEpoch, clears mustChangePin", () => {
    expect(() => changePin(db, 1, "000000", "222222")).toThrow(/current/i);
    const before = db.select().from(schema.players).all()[0].sessionEpoch;
    changePin(db, 1, "111111", "222222");
    const after = db.select().from(schema.players).all()[0];
    expect(after.sessionEpoch).toBe(before + 1);
    expect(loginPlayer(db, "09700000001", "222222", NOW).player.id).toBe(1);
  });
});
```

- [ ] **Step 3: Run → FAIL. Implement `src/lib/auth/flows.ts`**

```ts
import { eq } from "drizzle-orm";
import { schema, type Db } from "@/lib/db";
import { normalizePhone } from "./phone";
import { hashPin, verifyPin, registerFailure, lockState } from "./pin";

function err(message: string, httpStatus: number) {
  return Object.assign(new Error(message), { httpStatus });
}

export function registerPlayer(
  db: Db,
  input: { code: string; phone: string; name: string; pin: string },
  nowIso: string,
) {
  const phone = normalizePhone(input.phone);
  const code = db
    .select()
    .from(schema.inviteCodes)
    .where(eq(schema.inviteCodes.code, input.code))
    .get();
  if (
    !code ||
    code.usedCount >= code.maxUses ||
    Date.parse(code.expiresAt) < Date.parse(nowIso)
  )
    throw err("invalid or expired invite code", 400);
  if (
    db
      .select()
      .from(schema.players)
      .where(eq(schema.players.phone, phone))
      .get()
  )
    throw err("phone already registered", 409);
  if (!input.name.trim()) throw err("name required", 400);

  const pinHash = hashPin(input.pin); // throws "PIN must be exactly 6 digits"
  const player = db
    .insert(schema.players)
    .values({
      phone,
      pinHash,
      displayName: input.name.trim(),
      createdAt: nowIso,
    })
    .returning()
    .get();
  db.update(schema.inviteCodes)
    .set({ usedCount: code.usedCount + 1 })
    .where(eq(schema.inviteCodes.id, code.id))
    .run();
  return player;
}

export function loginPlayer(
  db: Db,
  rawPhone: string,
  pin: string,
  nowIso: string,
) {
  const phone = normalizePhone(rawPhone);
  const p = db
    .select()
    .from(schema.players)
    .where(eq(schema.players.phone, phone))
    .get();
  if (!p) throw err("wrong phone or PIN", 401);
  if (lockState(p, nowIso).locked)
    throw err("account locked — try later or ask admin", 423);

  if (!verifyPin(pin, p.pinHash)) {
    const next = registerFailure(p, nowIso);
    db.update(schema.players)
      .set(next)
      .where(eq(schema.players.id, p.id))
      .run();
    throw err("wrong phone or PIN", 401);
  }
  db.update(schema.players)
    .set({ failedPinAttempts: 0, lockedUntil: null })
    .where(eq(schema.players.id, p.id))
    .run();
  return { player: { ...p, failedPinAttempts: 0, lockedUntil: null } };
}

export function changePin(
  db: Db,
  playerId: number,
  currentPin: string,
  newPin: string,
) {
  const p = db
    .select()
    .from(schema.players)
    .where(eq(schema.players.id, playerId))
    .get();
  if (!p) throw err("not found", 404);
  if (!verifyPin(currentPin, p.pinHash))
    throw err("current PIN incorrect", 401);
  db.update(schema.players)
    .set({
      pinHash: hashPin(newPin),
      mustChangePin: false,
      sessionEpoch: p.sessionEpoch + 1,
    })
    .where(eq(schema.players.id, playerId))
    .run();
}
```

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Write the thin route handlers.**

`src/app/api/auth/register/route.ts`:

```ts
import { getDb } from "@/lib/db";
import { registerPlayer } from "@/lib/auth/flows";
import { setSessionCookie } from "@/lib/auth/session";
import { ok, handle } from "@/lib/api";
import { nowIso } from "@/lib/time";

export async function POST(req: Request) {
  return handle(async () => {
    const body = await req.json();
    const p = registerPlayer(getDb(), body, nowIso());
    await setSessionCookie({
      playerId: p.id,
      role: p.role,
      epoch: p.sessionEpoch,
    });
    return ok({
      id: p.id,
      name: p.displayName,
      role: p.role,
      language: p.language,
    });
  });
}
```

`src/app/api/auth/login/route.ts`:

```ts
import { getDb } from "@/lib/db";
import { loginPlayer } from "@/lib/auth/flows";
import { setSessionCookie } from "@/lib/auth/session";
import { ok, handle } from "@/lib/api";
import { nowIso } from "@/lib/time";

export async function POST(req: Request) {
  return handle(async () => {
    const { phone, pin } = await req.json();
    const { player } = loginPlayer(getDb(), phone, pin, nowIso());
    await setSessionCookie({
      playerId: player.id,
      role: player.role,
      epoch: player.sessionEpoch,
    });
    return ok({
      id: player.id,
      name: player.displayName,
      role: player.role,
      language: player.language,
      mustChangePin: player.mustChangePin,
    });
  });
}
```

`src/app/api/auth/logout/route.ts`:

```ts
import { clearSessionCookie } from "@/lib/auth/session";
import { ok } from "@/lib/api";

export async function POST() {
  await clearSessionCookie();
  return ok({});
}
```

`src/app/api/auth/change-pin/route.ts`:

```ts
import { getDb } from "@/lib/db";
import { changePin } from "@/lib/auth/flows";
import { requirePlayer, setSessionCookie } from "@/lib/auth/session";
import { ok, handle } from "@/lib/api";

export async function POST(req: Request) {
  return handle(async () => {
    const me = await requirePlayer();
    const { currentPin, newPin } = await req.json();
    changePin(getDb(), me.id, currentPin, newPin);
    await setSessionCookie({
      playerId: me.id,
      role: me.role,
      epoch: me.sessionEpoch + 1,
    });
    return ok({});
  });
}
```

- [ ] **Step 6: Verify build + tests** — `npx tsc --noEmit && npx vitest run` → Expected: clean. Commit:

```bash
git add src/lib/api.ts src/lib/auth src/app/api/auth
git commit -m "feat: auth flows + register/login/logout/change-pin routes"
```

### Task 9: Invite codes + player admin actions (reset PIN, lock, grant admin)

**Files:**

- Create: `src/lib/auth/adminActions.ts`, `src/app/api/admin/invites/route.ts`, `src/app/api/admin/players/route.ts`
- Test: `src/lib/auth/adminActions.test.ts`

- [ ] **Step 1: Failing test `src/lib/auth/adminActions.test.ts`**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, schema, type Db } from "@/lib/db";
import { hashPin, verifyPin } from "./pin";
import {
  createInvite,
  resetPin,
  unlockPlayer,
  grantAdmin,
} from "./adminActions";

let db: Db;
const NOW = "2026-06-12T10:00:00Z";

beforeEach(() => {
  db = createTestDb();
  db.insert(schema.players)
    .values([
      {
        phone: "09700000001",
        pinHash: hashPin("111111"),
        displayName: "Admin",
        role: "admin",
        createdAt: NOW,
      },
      {
        phone: "09700000002",
        pinHash: hashPin("222222"),
        displayName: "Zaw",
        createdAt: NOW,
      },
    ])
    .run();
});

it("createInvite generates an 6-char unambiguous code", () => {
  const inv = createInvite(db, 1, {
    maxUses: 10,
    expiresAt: "2026-07-20T00:00:00Z",
  });
  expect(inv.code).toMatch(/^[2-9A-HJ-NP-Z]{6}$/);
});

it("resetPin sets temp pin, forces change, bumps epoch, audit-logs", () => {
  const before = db.select().from(schema.players).all()[1];
  resetPin(db, 1, 2, "999999", NOW);
  const after = db.select().from(schema.players).all()[1];
  expect(verifyPin("999999", after.pinHash)).toBe(true);
  expect(after.mustChangePin).toBe(true);
  expect(after.sessionEpoch).toBe(before.sessionEpoch + 1);
  expect(db.select().from(schema.auditLog).all()[0].action).toBe("pin_reset");
});

it("unlockPlayer clears lock; grantAdmin flips role; both audit-log", () => {
  db.update(schema.players)
    .set({ failedPinAttempts: 5, lockedUntil: "2026-06-12T10:15:00Z" })
    .run();
  unlockPlayer(db, 1, 2, NOW);
  expect(db.select().from(schema.players).all()[1].lockedUntil).toBeNull();
  grantAdmin(db, 1, 2, NOW);
  expect(db.select().from(schema.players).all()[1].role).toBe("admin");
  expect(
    db
      .select()
      .from(schema.auditLog)
      .all()
      .map((a) => a.action),
  ).toEqual(["unlock", "grant_admin"]);
});
```

- [ ] **Step 2: Run → FAIL. Implement `src/lib/auth/adminActions.ts`**

```ts
import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { schema, type Db } from "@/lib/db";
import { hashPin } from "./pin";

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // no 0/O/1/I

export function randomCode(len: number): string {
  const bytes = randomBytes(len);
  let out = "";
  for (let k = 0; k < len; k++) out += ALPHABET[bytes[k] % ALPHABET.length];
  return out;
}

function audit(
  db: Db,
  actorId: number,
  action: string,
  subject: string,
  at: string,
  detail?: string,
) {
  db.insert(schema.auditLog)
    .values({ actorId, action, subject, detail, at })
    .run();
}

export function createInvite(
  db: Db,
  adminId: number,
  opts: { maxUses: number; expiresAt: string },
) {
  return db
    .insert(schema.inviteCodes)
    .values({
      code: randomCode(6),
      maxUses: opts.maxUses,
      expiresAt: opts.expiresAt,
      createdBy: adminId,
    })
    .returning()
    .get();
}

export function resetPin(
  db: Db,
  adminId: number,
  playerId: number,
  tempPin: string,
  at: string,
) {
  const p = db
    .select()
    .from(schema.players)
    .where(eq(schema.players.id, playerId))
    .get();
  if (!p)
    throw Object.assign(new Error("player not found"), { httpStatus: 404 });
  db.update(schema.players)
    .set({
      pinHash: hashPin(tempPin),
      mustChangePin: true,
      sessionEpoch: p.sessionEpoch + 1,
      failedPinAttempts: 0,
      lockedUntil: null,
    })
    .where(eq(schema.players.id, playerId))
    .run();
  audit(db, adminId, "pin_reset", `player:${playerId}`, at);
}

export function unlockPlayer(
  db: Db,
  adminId: number,
  playerId: number,
  at: string,
) {
  db.update(schema.players)
    .set({ failedPinAttempts: 0, lockedUntil: null })
    .where(eq(schema.players.id, playerId))
    .run();
  audit(db, adminId, "unlock", `player:${playerId}`, at);
}

export function grantAdmin(
  db: Db,
  adminId: number,
  playerId: number,
  at: string,
) {
  db.update(schema.players)
    .set({ role: "admin" })
    .where(eq(schema.players.id, playerId))
    .run();
  audit(db, adminId, "grant_admin", `player:${playerId}`, at);
}
```

- [ ] **Step 3: Run → PASS.**

- [ ] **Step 4: Thin routes.** `src/app/api/admin/invites/route.ts`:

```ts
import { getDb, schema } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { createInvite } from "@/lib/auth/adminActions";
import { ok, handle } from "@/lib/api";

export async function GET() {
  return handle(async () => {
    await requireAdmin();
    return ok(getDb().select().from(schema.inviteCodes).all());
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const admin = await requireAdmin();
    const { maxUses, expiresAt } = await req.json();
    return ok(createInvite(getDb(), admin.id, { maxUses, expiresAt }));
  });
}
```

`src/app/api/admin/players/route.ts`:

```ts
import { getDb, schema } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { resetPin, unlockPlayer, grantAdmin } from "@/lib/auth/adminActions";
import { ok, fail, handle } from "@/lib/api";
import { nowIso } from "@/lib/time";

export async function GET() {
  return handle(async () => {
    await requireAdmin();
    const rows = getDb().select().from(schema.players).all();
    return ok(rows.map(({ pinHash: _ph, ...rest }) => rest));
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const admin = await requireAdmin();
    const { action, playerId, tempPin } = await req.json();
    const db = getDb();
    if (action === "reset_pin")
      resetPin(db, admin.id, playerId, tempPin, nowIso());
    else if (action === "unlock")
      unlockPlayer(db, admin.id, playerId, nowIso());
    else if (action === "grant_admin")
      grantAdmin(db, admin.id, playerId, nowIso());
    else return fail("bad_action", "unknown action");
    return ok({});
  });
}
```

- [ ] **Step 5: Verify + commit**

```bash
npx tsc --noEmit && npx vitest run
git add src/lib/auth/adminActions* src/app/api/admin
git commit -m "feat: invite codes + admin player actions with audit log"
```

### Task 10: SSE hub and stream route

**Files:**

- Create: `src/lib/sse.ts`, `src/app/api/stream/route.ts`
- Test: `src/lib/sse.test.ts`

- [ ] **Step 1: Failing test `src/lib/sse.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { sseHub } from "./sse";

describe("sseHub", () => {
  it("delivers broadcast events to subscribers and stops after unsubscribe", () => {
    const got: string[] = [];
    const unsub = sseHub.subscribe((chunk) => got.push(chunk));
    sseHub.broadcast("line_update", { matchId: 3, version: 7 });
    unsub();
    sseHub.broadcast("line_update", { matchId: 3, version: 8 });
    expect(got).toHaveLength(1);
    expect(got[0]).toBe(
      'event: line_update\ndata: {"matchId":3,"version":7}\n\n',
    );
  });
});
```

- [ ] **Step 2: Run → FAIL. Implement `src/lib/sse.ts`**

```ts
type Listener = (chunk: string) => void;

class SseHub {
  private listeners = new Set<Listener>();

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  broadcast(event: string, data: unknown) {
    const chunk = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const fn of this.listeners) fn(chunk);
  }
}

// survive dev hot-reload; single instance per process
const g = globalThis as unknown as { __sseHub?: SseHub };
export const sseHub = (g.__sseHub ??= new SseHub());
```

- [ ] **Step 3: Run → PASS. Write `src/app/api/stream/route.ts`**

```ts
import { requirePlayer } from "@/lib/auth/session";
import { sseHub } from "@/lib/sse";

export const dynamic = "force-dynamic";

export async function GET() {
  await requirePlayer();
  const encoder = new TextEncoder();
  let unsub = () => {};
  let ping: ReturnType<typeof setInterval>;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(": connected\n\n"));
      unsub = sseHub.subscribe((chunk) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          unsub();
        }
      });
      ping = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          clearInterval(ping);
          unsub();
        }
      }, 25_000);
    },
    cancel() {
      unsub();
      clearInterval(ping);
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
```

- [ ] **Step 4: Commit** — `git add src/lib/sse* src/app/api/stream; git commit -m "feat: SSE hub + stream endpoint"`

### Task 11: Lines — post/move/suspend/resume/close

**Files:**

- Create: `src/lib/lines/manage.ts`, `src/app/api/admin/lines/route.ts`, `src/app/api/matches/route.ts`
- Test: `src/lib/lines/manage.test.ts`

- [ ] **Step 1: Failing test `src/lib/lines/manage.test.ts`**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, schema, type Db } from "@/lib/db";
import { postLine, setLineStatus, activeLine } from "./manage";
import { hashPin } from "@/lib/auth/pin";

let db: Db;
const NOW = "2026-06-12T10:00:00Z";

beforeEach(() => {
  db = createTestDb();
  db.insert(schema.players)
    .values({
      phone: "09700000001",
      pinHash: hashPin("111111"),
      displayName: "A",
      role: "admin",
      createdAt: NOW,
    })
    .run();
  db.insert(schema.matches)
    .values({
      stage: "Group C",
      homeTeam: "BRA",
      awayTeam: "MEX",
      kickoffUtc: "2026-06-12T02:00:00Z",
      venue: "X",
      matchDay: "2026-06-12",
    })
    .run();
});

it("posting closes the previous line and increments version", () => {
  const l1 = postLine(
    db,
    1,
    { matchId: 1, favSide: "home", ballQ: 3, priceC: 92 },
    NOW,
  );
  expect(l1.version).toBe(1);
  const l2 = postLine(
    db,
    1,
    { matchId: 1, favSide: "home", ballQ: 4, priceC: -95 },
    NOW,
  );
  expect(l2.version).toBe(2);
  const rows = db.select().from(schema.lines).all();
  expect(rows.find((r) => r.id === l1.id)!.status).toBe("closed");
  expect(activeLine(db, 1)!.id).toBe(l2.id);
});

it("suspend/resume toggles; closed lines cannot resume; bad prices rejected", () => {
  const l = postLine(
    db,
    1,
    { matchId: 1, favSide: "home", ballQ: 2, priceC: 85 },
    NOW,
  );
  setLineStatus(db, 1, "suspended");
  expect(activeLine(db, 1)).toBeNull();
  setLineStatus(db, 1, "active");
  expect(activeLine(db, 1)!.id).toBe(l.id);
  setLineStatus(db, 1, "closed");
  expect(() => setLineStatus(db, 1, "active")).toThrow(/closed/);
  expect(() =>
    postLine(db, 1, { matchId: 1, favSide: "home", ballQ: 2, priceC: 0 }, NOW),
  ).toThrow();
  expect(() =>
    postLine(
      db,
      1,
      { matchId: 1, favSide: "home", ballQ: -1, priceC: 90 },
      NOW,
    ),
  ).toThrow();
});
```

- [ ] **Step 2: Run → FAIL. Implement `src/lib/lines/manage.ts`**

```ts
import { and, eq, ne, desc } from "drizzle-orm";
import { schema, type Db } from "@/lib/db";
import { sseHub } from "@/lib/sse";

function err(message: string, httpStatus = 400) {
  return Object.assign(new Error(message), { httpStatus });
}

export function activeLine(db: Db, matchId: number) {
  const latest = db
    .select()
    .from(schema.lines)
    .where(eq(schema.lines.matchId, matchId))
    .orderBy(desc(schema.lines.version))
    .limit(1)
    .get();
  return latest && latest.status === "active" ? latest : null;
}

export function latestLine(db: Db, matchId: number) {
  return (
    db
      .select()
      .from(schema.lines)
      .where(eq(schema.lines.matchId, matchId))
      .orderBy(desc(schema.lines.version))
      .limit(1)
      .get() ?? null
  );
}

export function postLine(
  db: Db,
  adminId: number,
  input: {
    matchId: number;
    favSide: "home" | "away";
    ballQ: number;
    priceC: number;
  },
  at: string,
) {
  if (!Number.isInteger(input.ballQ) || input.ballQ < 0)
    throw err("invalid ball");
  if (
    !Number.isInteger(input.priceC) ||
    input.priceC === 0 ||
    Math.abs(input.priceC) > 100
  )
    throw err("invalid price");
  const match = db
    .select()
    .from(schema.matches)
    .where(eq(schema.matches.id, input.matchId))
    .get();
  if (!match) throw err("match not found", 404);
  if (match.status === "finished") throw err("match finished");

  const prev = latestLine(db, input.matchId);
  if (prev && prev.status !== "closed")
    db.update(schema.lines)
      .set({ status: "closed" })
      .where(eq(schema.lines.id, prev.id))
      .run();

  const line = db
    .insert(schema.lines)
    .values({
      matchId: input.matchId,
      version: (prev?.version ?? 0) + 1,
      favSide: input.favSide,
      ballQ: input.ballQ,
      priceC: input.priceC,
      status: "active",
      postedBy: adminId,
      postedAt: at,
    })
    .returning()
    .get();

  sseHub.broadcast("line_update", { matchId: input.matchId, line });
  return line;
}

export function setLineStatus(
  db: Db,
  matchId: number,
  status: "active" | "suspended" | "closed",
) {
  const latest = latestLine(db, matchId);
  if (!latest) throw err("no line", 404);
  if (latest.status === "closed" && status !== "closed")
    throw err("line is closed");
  db.update(schema.lines)
    .set({ status })
    .where(eq(schema.lines.id, latest.id))
    .run();
  sseHub.broadcast("line_update", { matchId, line: { ...latest, status } });
  return { ...latest, status };
}
```

- [ ] **Step 3: Run → PASS. Thin routes.**

`src/app/api/admin/lines/route.ts`:

```ts
import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { postLine, setLineStatus } from "@/lib/lines/manage";
import { ok, fail, handle } from "@/lib/api";
import { nowIso } from "@/lib/time";

export async function POST(req: Request) {
  return handle(async () => {
    const admin = await requireAdmin();
    const body = await req.json();
    const db = getDb();
    if (body.action === "post")
      return ok(postLine(db, admin.id, body, nowIso()));
    if (["suspend", "resume", "close"].includes(body.action)) {
      const status =
        body.action === "suspend"
          ? "suspended"
          : body.action === "resume"
            ? "active"
            : "closed";
      return ok(setLineStatus(db, body.matchId, status));
    }
    return fail("bad_action", "unknown action");
  });
}
```

`src/app/api/matches/route.ts` (player match list — matches + latest line + live score):

```ts
import { getDb, schema } from "@/lib/db";
import { requirePlayer } from "@/lib/auth/session";
import { latestLine } from "@/lib/lines/manage";
import { ok, handle } from "@/lib/api";

export async function GET() {
  return handle(async () => {
    await requirePlayer();
    const db = getDb();
    const all = db.select().from(schema.matches).all();
    return ok(all.map((m) => ({ ...m, line: latestLine(db, m.id) })));
  });
}
```

- [ ] **Step 4: Verify + commit**

```bash
npx tsc --noEmit && npx vitest run
git add src/lib/lines src/app/api/admin/lines src/app/api/matches
git commit -m "feat: line management with versioning, suspension, SSE broadcast"
```

### Task 12: Ticket numbers and QR signatures

**Files:**

- Create: `src/lib/ticket/ticketNo.ts`, `src/lib/ticket/sign.ts`
- Test: `src/lib/ticket/ticket.test.ts`

- [ ] **Step 1: Failing test `src/lib/ticket/ticket.test.ts`**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { newTicketNo } from "./ticketNo";
import { signTicket, verifyTicketSig, ticketUrl } from "./sign";

beforeEach(() => {
  process.env.TICKET_SECRETS = "secret-v1,secret-v2";
  process.env.APP_ORIGIN = "https://bet.example.com";
});

it("generates WB-XXXXX with unambiguous alphabet", () => {
  for (let k = 0; k < 50; k++)
    expect(newTicketNo()).toMatch(/^WB-[2-9A-HJ-NP-Z]{5}$/);
});

it("signs with newest key, verifies any listed version, rejects tampering", () => {
  const { v, sig } = signTicket("WB-7K3F9");
  expect(v).toBe(2);
  expect(verifyTicketSig("WB-7K3F9", v, sig)).toBe(true);
  expect(verifyTicketSig("WB-7K3F9", 1, signTicket("WB-7K3F9", 1).sig)).toBe(
    true,
  ); // old keys stay valid
  expect(verifyTicketSig("WB-7K3F8", v, sig)).toBe(false);
  expect(verifyTicketSig("WB-7K3F9", v, sig.slice(0, -2) + "aa")).toBe(false);
  expect(verifyTicketSig("WB-7K3F9", 9, sig)).toBe(false); // unknown version
});

it("builds the verification URL", () => {
  const { v, sig } = signTicket("WB-7K3F9");
  expect(ticketUrl("WB-7K3F9")).toBe(
    `https://bet.example.com/t/WB-7K3F9?v=${v}&sig=${sig}`,
  );
});
```

- [ ] **Step 2: Run → FAIL. Implement `src/lib/ticket/ticketNo.ts`**

```ts
import { randomBytes } from "node:crypto";

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function newTicketNo(): string {
  const bytes = randomBytes(5);
  let s = "";
  for (let k = 0; k < 5; k++) s += ALPHABET[bytes[k] % ALPHABET.length];
  return `WB-${s}`;
}
```

And `src/lib/ticket/sign.ts`:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

function secrets(): string[] {
  const raw = process.env.TICKET_SECRETS;
  if (!raw) throw new Error("TICKET_SECRETS not set");
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function hmac(secret: string, ticketNo: string): string {
  return createHmac("sha256", secret)
    .update(ticketNo)
    .digest("base64url")
    .slice(0, 22); // 16 bytes ≈ 22 chars
}

/** Sign with the given key version (1-based) or the newest. */
export function signTicket(
  ticketNo: string,
  version?: number,
): { v: number; sig: string } {
  const list = secrets();
  const v = version ?? list.length;
  const secret = list[v - 1];
  if (!secret) throw new Error("unknown ticket secret version");
  return { v, sig: hmac(secret, ticketNo) };
}

export function verifyTicketSig(
  ticketNo: string,
  v: number,
  sig: string,
): boolean {
  const list = secrets();
  const secret = list[v - 1];
  if (!secret) return false;
  const expected = hmac(secret, ticketNo);
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function ticketUrl(ticketNo: string): string {
  const { v, sig } = signTicket(ticketNo);
  return `${process.env.APP_ORIGIN}/t/${ticketNo}?v=${v}&sig=${sig}`;
}
```

Add `APP_ORIGIN=https://your-domain-or-ip` to `.env.example` and `.env.local`.

- [ ] **Step 3: Run → PASS. Commit** — `git add src/lib/ticket .env.example; git commit -m "feat: ticket numbers + versioned HMAC QR signatures"`

### Task 13: Bet placement transaction (versions, limits, snapshot)

**Files:**

- Create: `src/lib/bets/place.ts`, `src/app/api/bets/route.ts`
- Test: `src/lib/bets/place.test.ts`

- [ ] **Step 1: Failing test `src/lib/bets/place.test.ts`**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, schema, type Db } from "@/lib/db";
import { hashPin } from "@/lib/auth/pin";
import { postLine, setLineStatus } from "@/lib/lines/manage";
import { placeBet } from "./place";

let db: Db;
const NOW = "2026-06-12T10:00:00Z";

function seedMatch(
  db: Db,
  overrides: Partial<typeof schema.matches.$inferInsert> = {},
) {
  return db
    .insert(schema.matches)
    .values({
      stage: "Group C",
      homeTeam: "BRA",
      awayTeam: "MEX",
      kickoffUtc: "2026-06-12T02:00:00Z",
      venue: "X",
      matchDay: "2026-06-12",
      ...overrides,
    })
    .returning()
    .get();
}

beforeEach(() => {
  db = createTestDb();
  db.insert(schema.players)
    .values([
      {
        phone: "09700000001",
        pinHash: hashPin("111111"),
        displayName: "Admin",
        role: "admin",
        createdAt: NOW,
      },
      {
        phone: "09700000002",
        pinHash: hashPin("222222"),
        displayName: "Zaw",
        createdAt: NOW,
      },
    ])
    .run();
  db.insert(schema.settings).values({ id: 1, dailyTotalLimitMmk: 0 }).run();
});

it("places a bet locking line version and snapshotting score", () => {
  const m = seedMatch(db, { status: "live", homeScore: 1, awayScore: 0 });
  const line = postLine(
    db,
    1,
    { matchId: m.id, favSide: "home", ballQ: 3, priceC: 92 },
    NOW,
  );
  const bet = placeBet(
    db,
    2,
    {
      matchId: m.id,
      lineVersion: line.version,
      side: "fav",
      stakeMmk: 100_000,
    },
    NOW,
  );
  expect(bet.ticketNo).toMatch(/^WB-/);
  expect(bet.scoreHomeAtBet).toBe(1);
  expect(bet.scoreAwayAtBet).toBe(0);
  expect(bet.lineId).toBe(line.id);
});

it("rejects: stale version, suspended line, finished match, sub-floor stake", () => {
  const m = seedMatch(db);
  postLine(
    db,
    1,
    { matchId: m.id, favSide: "home", ballQ: 3, priceC: 92 },
    NOW,
  );
  const l2 = postLine(
    db,
    1,
    { matchId: m.id, favSide: "home", ballQ: 4, priceC: 95 },
    NOW,
  );
  expect(() =>
    placeBet(
      db,
      2,
      { matchId: m.id, lineVersion: 1, side: "fav", stakeMmk: 50_000 },
      NOW,
    ),
  ).toThrow(/line moved/);
  setLineStatus(db, m.id, "suspended");
  expect(() =>
    placeBet(
      db,
      2,
      { matchId: m.id, lineVersion: l2.version, side: "fav", stakeMmk: 50_000 },
      NOW,
    ),
  ).toThrow(/suspended/);
  setLineStatus(db, m.id, "active");
  expect(() =>
    placeBet(
      db,
      2,
      { matchId: m.id, lineVersion: l2.version, side: "fav", stakeMmk: 9_999 },
      NOW,
    ),
  ).toThrow(/minimum/);
});

it("enforces the daily pool and per-match carve-out", () => {
  const a = seedMatch(db);
  const b = seedMatch(db, {
    homeTeam: "USA",
    awayTeam: "JPN",
    betLimitMmk: 150_000,
  });
  const la = postLine(
    db,
    1,
    { matchId: a.id, favSide: "home", ballQ: 2, priceC: 90 },
    NOW,
  );
  const lb = postLine(
    db,
    1,
    { matchId: b.id, favSide: "home", ballQ: 2, priceC: 90 },
    NOW,
  );
  db.update(schema.settings).set({ dailyTotalLimitMmk: 300_000 }).run();

  // carve-out match b: its own cap, not the pool
  placeBet(
    db,
    2,
    { matchId: b.id, lineVersion: lb.version, side: "fav", stakeMmk: 100_000 },
    NOW,
  );
  expect(() =>
    placeBet(
      db,
      2,
      { matchId: b.id, lineVersion: lb.version, side: "dog", stakeMmk: 60_000 },
      NOW,
    ),
  ).toThrow(/50,000/); // headroom message
  // pool match a: 300k daily, b's 100k does NOT consume it
  placeBet(
    db,
    2,
    { matchId: a.id, lineVersion: la.version, side: "fav", stakeMmk: 290_000 },
    NOW,
  );
  expect(() =>
    placeBet(
      db,
      2,
      { matchId: a.id, lineVersion: la.version, side: "dog", stakeMmk: 20_000 },
      NOW,
    ),
  ).toThrow(/10,000/);
});
```

- [ ] **Step 2: Run → FAIL. Implement `src/lib/bets/place.ts`**

```ts
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { schema, type Db } from "@/lib/db";
import { latestLine } from "@/lib/lines/manage";
import { newTicketNo } from "@/lib/ticket/ticketNo";

export const MIN_STAKE = 10_000;

function err(
  message: string,
  httpStatus = 400,
  extra?: Record<string, unknown>,
) {
  return Object.assign(new Error(message), { httpStatus, ...extra });
}

const fmt = (n: number) => n.toLocaleString("en-US");

export function placeBet(
  db: Db,
  playerId: number,
  input: {
    matchId: number;
    lineVersion: number;
    side: "fav" | "dog";
    stakeMmk: number;
  },
  at: string,
) {
  if (!Number.isInteger(input.stakeMmk) || input.stakeMmk < MIN_STAKE)
    throw err(`minimum stake is ${fmt(MIN_STAKE)} MMK`);

  // better-sqlite3 transactions are synchronous — drizzle exposes db.transaction
  return db.transaction((tx) => {
    const match = tx
      .select()
      .from(schema.matches)
      .where(eq(schema.matches.id, input.matchId))
      .get();
    if (!match) throw err("match not found", 404);
    if (match.status === "finished") throw err("match finished");

    const line = latestLine(tx as unknown as Db, input.matchId);
    if (!line || line.status === "closed")
      throw err("betting closed for this match");
    if (line.status === "suspended") throw err("line suspended — updating");
    if (line.version !== input.lineVersion)
      throw err("line moved — confirm the new price", 409, {
        currentLine: line,
      });

    // limits: carve-out vs daily pool (spec §8)
    const stakeOn = (matchIds: number[]) =>
      matchIds.length === 0
        ? 0
        : tx
            .select({
              s: sql<number>`coalesce(sum(${schema.bets.stakeMmk}), 0)`,
            })
            .from(schema.bets)
            .where(
              and(
                inArray(schema.bets.matchId, matchIds),
                ne(schema.bets.status, "void"),
              ),
            )
            .get()!.s;

    if (match.betLimitMmk != null) {
      const head = match.betLimitMmk - stakeOn([match.id]);
      if (input.stakeMmk > head)
        throw err(
          `house can accept only ${fmt(Math.max(head, 0))} MMK more on this match`,
          409,
        );
    } else {
      const cfg = tx.select().from(schema.settings).get();
      const daily = cfg?.dailyTotalLimitMmk ?? 0;
      if (daily > 0) {
        const poolMatches = tx
          .select({ id: schema.matches.id })
          .from(schema.matches)
          .where(
            and(
              eq(schema.matches.matchDay, match.matchDay),
              sql`${schema.matches.betLimitMmk} is null`,
            ),
          )
          .all()
          .map((r) => r.id);
        const head = daily - stakeOn(poolMatches);
        if (input.stakeMmk > head)
          throw err(
            `house can accept only ${fmt(Math.max(head, 0))} MMK more on this match day`,
            409,
          );
      }
    }

    // ensure match_day row exists and is open
    let day = tx
      .select()
      .from(schema.matchDays)
      .where(eq(schema.matchDays.date, match.matchDay))
      .get();
    if (!day)
      day = tx
        .insert(schema.matchDays)
        .values({ date: match.matchDay })
        .returning()
        .get();
    if (day.status !== "open") throw err("match day is closed for betting");

    return tx
      .insert(schema.bets)
      .values({
        ticketNo: newTicketNo(),
        playerId,
        matchId: match.id,
        lineId: line.id,
        side: input.side,
        stakeMmk: input.stakeMmk,
        scoreHomeAtBet: match.homeScore ?? 0,
        scoreAwayAtBet: match.awayScore ?? 0,
        placedAt: at,
      })
      .returning()
      .get();
  });
}
```

Note: `newTicketNo` collisions are possible (32^5 space) — the unique index makes the insert throw; the route returns 500 and the player retries. Acceptable at this scale; do not add retry loops.

- [ ] **Step 3: Run → PASS. Thin route `src/app/api/bets/route.ts`**

```ts
import { eq, desc } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requirePlayer } from "@/lib/auth/session";
import { placeBet } from "@/lib/bets/place";
import { ticketUrl } from "@/lib/ticket/sign";
import { ok, handle } from "@/lib/api";
import { nowIso } from "@/lib/time";

export async function POST(req: Request) {
  return handle(async () => {
    const me = await requirePlayer();
    const bet = placeBet(getDb(), me.id, await req.json(), nowIso());
    return ok({ ...bet, qrUrl: ticketUrl(bet.ticketNo) });
  });
}

export async function GET() {
  return handle(async () => {
    const me = await requirePlayer();
    const db = getDb();
    const rows = db
      .select()
      .from(schema.bets)
      .where(eq(schema.bets.playerId, me.id))
      .orderBy(desc(schema.bets.placedAt))
      .all();
    return ok(rows.map((b) => ({ ...b, qrUrl: ticketUrl(b.ticketNo) })));
  });
}
```

- [ ] **Step 4: Verify + commit**

```bash
npx tsc --noEmit && npx vitest run
git add src/lib/bets src/app/api/bets
git commit -m "feat: bet placement transaction with version lock and limits"
```

### Task 14: Public QR verification page

**Files:**

- Create: `src/app/t/[ticketNo]/page.tsx`
- Test: covered by Task 12's signature tests + manual check in Step 3

- [ ] **Step 1: Implement `src/app/t/[ticketNo]/page.tsx`** (server component, public — no session):

```tsx
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { verifyTicketSig } from "@/lib/ticket/sign";
import { formatMmt } from "@/lib/time";

function ballLabel(ballQ: number) {
  return (ballQ / 4).toString();
}
function priceLabel(priceC: number) {
  return (priceC / 100).toFixed(2);
}

export default async function VerifyTicket({
  params,
  searchParams,
}: {
  params: Promise<{ ticketNo: string }>;
  searchParams: Promise<{ v?: string; sig?: string }>;
}) {
  const { ticketNo } = await params;
  const { v, sig } = await searchParams;
  const valid = !!v && !!sig && verifyTicketSig(ticketNo, Number(v), sig);
  const db = getDb();
  const bet = valid
    ? db
        .select()
        .from(schema.bets)
        .where(eq(schema.bets.ticketNo, ticketNo))
        .get()
    : undefined;

  if (!valid || !bet) {
    return (
      <main className="mx-auto max-w-sm p-6 text-center">
        <h1 className="text-2xl font-bold text-red-600">
          ✕ NOT A VALID TICKET
        </h1>
        <p className="mt-2 text-gray-500">
          This QR code does not verify. The ticket may be forged.
        </p>
      </main>
    );
  }

  const match = db
    .select()
    .from(schema.matches)
    .where(eq(schema.matches.id, bet.matchId))
    .get()!;
  const line = db
    .select()
    .from(schema.lines)
    .where(eq(schema.lines.id, bet.lineId))
    .get()!;
  const player = db
    .select()
    .from(schema.players)
    .where(eq(schema.players.id, bet.playerId))
    .get()!;
  const fav = line.favSide === "home" ? match.homeTeam : match.awayTeam;
  const dog = line.favSide === "home" ? match.awayTeam : match.homeTeam;
  const pick =
    bet.side === "fav"
      ? `${fav} −${ballLabel(line.ballQ)}`
      : `${dog} +${ballLabel(line.ballQ)}`;

  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="text-center text-2xl font-bold text-green-600">
        ✓ VERIFIED TICKET
      </h1>
      <dl className="mt-4 space-y-2 rounded-xl border-2 border-dashed p-4">
        <Row k="Ticket" v={bet.ticketNo} />
        <Row k="Player" v={player.displayName} />
        <Row
          k="Match"
          v={`${match.homeTeam} vs ${match.awayTeam} (${match.stage})`}
        />
        <Row k="Pick" v={`${pick} @ ${priceLabel(line.priceC)}`} />
        <Row k="Stake" v={`${bet.stakeMmk.toLocaleString()} MMK`} />
        <Row
          k="Score at bet"
          v={`${bet.scoreHomeAtBet}–${bet.scoreAwayAtBet}`}
        />
        <Row k="Placed" v={formatMmt(bet.placedAt)} />
        <Row k="Status" v={bet.status.toUpperCase()} />
        {bet.netMmk != null && (
          <Row k="Net" v={`${bet.netMmk.toLocaleString()} MMK`} />
        )}
        {bet.settlementId != null && (
          <Row k="Settled" v={`ref #${bet.settlementId}`} />
        )}
      </dl>
    </main>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-gray-500">{k}</dt>
      <dd className="text-right font-medium">{v}</dd>
    </div>
  );
}
```

- [ ] **Step 2: Build check** — `npx tsc --noEmit` → Expected: clean.

- [ ] **Step 3: Manual verify** — `npm run dev`, place a bet via `curl` (login first, reuse cookie), open the returned `qrUrl` → VERIFIED; mangle one sig char → NOT VALID.

- [ ] **Step 4: Commit** — `git add src/app/t; git commit -m "feat: public QR ticket verification page"`

### Task 15: Score updates and live status (admin)

**Files:**

- Create: `src/lib/matches/score.ts`, `src/app/api/admin/scores/route.ts`
- Test: `src/lib/matches/score.test.ts`

- [ ] **Step 1: Failing test `src/lib/matches/score.test.ts`**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, schema, type Db } from "@/lib/db";
import { hashPin } from "@/lib/auth/pin";
import { updateLiveScore, setMatchLive } from "./score";

let db: Db;
const NOW = "2026-06-12T10:00:00Z";

beforeEach(() => {
  db = createTestDb();
  db.insert(schema.players)
    .values({
      phone: "09700000001",
      pinHash: hashPin("111111"),
      displayName: "A",
      role: "admin",
      createdAt: NOW,
    })
    .run();
  db.insert(schema.matches)
    .values({
      stage: "Group C",
      homeTeam: "BRA",
      awayTeam: "MEX",
      kickoffUtc: "2026-06-12T02:00:00Z",
      venue: "X",
      matchDay: "2026-06-12",
    })
    .run();
});

it("marks live and updates the running score", () => {
  setMatchLive(db, 1);
  updateLiveScore(db, 1, 1, 0);
  const m = db.select().from(schema.matches).all()[0];
  expect(m.status).toBe("live");
  expect(m.homeScore).toBe(1);
  expect(() => updateLiveScore(db, 1, -1, 0)).toThrow();
});
```

- [ ] **Step 2: Run → FAIL. Implement `src/lib/matches/score.ts`**

```ts
import { eq } from "drizzle-orm";
import { schema, type Db } from "@/lib/db";
import { sseHub } from "@/lib/sse";

function err(message: string, httpStatus = 400) {
  return Object.assign(new Error(message), { httpStatus });
}

export function setMatchLive(db: Db, matchId: number) {
  db.update(schema.matches)
    .set({ status: "live", homeScore: 0, awayScore: 0 })
    .where(eq(schema.matches.id, matchId))
    .run();
  sseHub.broadcast("score_update", {
    matchId,
    homeScore: 0,
    awayScore: 0,
    status: "live",
  });
}

export function updateLiveScore(
  db: Db,
  matchId: number,
  home: number,
  away: number,
) {
  if (
    !Number.isInteger(home) ||
    !Number.isInteger(away) ||
    home < 0 ||
    away < 0
  )
    throw err("invalid score");
  const m = db
    .select()
    .from(schema.matches)
    .where(eq(schema.matches.id, matchId))
    .get();
  if (!m) throw err("match not found", 404);
  if (m.status === "finished")
    throw err("match finished — use score correction");
  db.update(schema.matches)
    .set({ status: "live", homeScore: home, awayScore: away })
    .where(eq(schema.matches.id, matchId))
    .run();
  sseHub.broadcast("score_update", {
    matchId,
    homeScore: home,
    awayScore: away,
    status: "live",
  });
}
```

- [ ] **Step 3: Run → PASS. Commit** — `git add src/lib/matches; git commit -m "feat: live score updates"`

### Task 16: Grading on final score + day close + corrections

**Files:**

- Create: `src/lib/bets/settleMatch.ts`
- Modify: `src/app/api/admin/scores/route.ts` (created here, single route for live/final/correction)
- Test: `src/lib/bets/settleMatch.test.ts`

- [ ] **Step 1: Failing test `src/lib/bets/settleMatch.test.ts`**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, schema, type Db } from "@/lib/db";
import { hashPin } from "@/lib/auth/pin";
import { postLine } from "@/lib/lines/manage";
import { placeBet } from "./place";
import { confirmFinalScore, correctScore } from "./settleMatch";
import { eq } from "drizzle-orm";

let db: Db;
const NOW = "2026-06-12T10:00:00Z";

beforeEach(() => {
  db = createTestDb();
  db.insert(schema.players)
    .values([
      {
        phone: "09700000001",
        pinHash: hashPin("111111"),
        displayName: "Admin",
        role: "admin",
        createdAt: NOW,
      },
      {
        phone: "09700000002",
        pinHash: hashPin("222222"),
        displayName: "Zaw",
        createdAt: NOW,
      },
    ])
    .run();
  db.insert(schema.settings).values({ id: 1, dailyTotalLimitMmk: 0 }).run();
  db.insert(schema.matches)
    .values([
      {
        stage: "Group C",
        homeTeam: "BRA",
        awayTeam: "MEX",
        kickoffUtc: "2026-06-12T02:00:00Z",
        venue: "X",
        matchDay: "2026-06-12",
      },
      {
        stage: "Group D",
        homeTeam: "USA",
        awayTeam: "JPN",
        kickoffUtc: "2026-06-12T05:00:00Z",
        venue: "Y",
        matchDay: "2026-06-12",
      },
    ])
    .run();
});

function bet(matchId: number, side: "fav" | "dog", stake: number) {
  const line = postLine(
    db,
    1,
    { matchId, favSide: "home", ballQ: 3, priceC: 92 },
    NOW,
  );
  return placeBet(
    db,
    2,
    { matchId, lineVersion: line.version, side, stakeMmk: stake },
    NOW,
  );
}

it("grades all pending tickets; closes the day when last match graded", () => {
  const b1 = bet(1, "fav", 100_000); // BRA -0.75 @0.92
  const b2 = bet(2, "dog", 200_000); // JPN +0.75 @0.92
  confirmFinalScore(db, 1, 1, 2, 1, NOW); // BRA 2-1 → wins by 1 → fav half_won +46,000
  let day = db.select().from(schema.matchDays).all()[0];
  expect(day.status).toBe("open"); // match 2 not graded yet
  const g1 = db
    .select()
    .from(schema.bets)
    .where(eq(schema.bets.id, b1.id))
    .get()!;
  expect(g1.status).toBe("half_won");
  expect(g1.netMmk).toBe(46_000);

  confirmFinalScore(db, 1, 2, 0, 0, NOW); // draw → dog +0.75 wins → +184,000
  const g2 = db
    .select()
    .from(schema.bets)
    .where(eq(schema.bets.id, b2.id))
    .get()!;
  expect(g2.status).toBe("won");
  expect(g2.netMmk).toBe(184_000);
  day = db.select().from(schema.matchDays).all()[0];
  expect(day.status).toBe("closed");
});

it("live bets grade on effective score", () => {
  db.update(schema.matches)
    .set({ status: "live", homeScore: 1, awayScore: 0 })
    .where(eq(schema.matches.id, 1))
    .run();
  const b = bet(1, "dog", 100_000); // MEX +0.75 at 1-0
  confirmFinalScore(db, 1, 1, 2, 1, NOW); // eff 1-1 → dog covers +0.75 → won
  const g = db
    .select()
    .from(schema.bets)
    .where(eq(schema.bets.id, b.id))
    .get()!;
  expect(g.status).toBe("won");
  expect(g.netMmk).toBe(92_000);
});

it("correction re-grades while unsettled, blocked once settled, voids excluded", () => {
  const b = bet(1, "fav", 100_000);
  confirmFinalScore(db, 1, 1, 2, 1, NOW);
  correctScore(db, 1, 1, 3, 1, NOW); // now wins by 2 → won 92,000
  const g = db
    .select()
    .from(schema.bets)
    .where(eq(schema.bets.id, b.id))
    .get()!;
  expect(g.status).toBe("won");
  expect(g.netMmk).toBe(92_000);
  expect(
    db
      .select()
      .from(schema.auditLog)
      .all()
      .some((a) => a.action === "score_correction"),
  ).toBe(true);

  db.update(schema.matchDays).set({ status: "settled" }).run();
  expect(() => correctScore(db, 1, 1, 1, 1, NOW)).toThrow(/settled/);
});
```

- [ ] **Step 2: Run → FAIL. Implement `src/lib/bets/settleMatch.ts`**

```ts
import { and, eq, ne, notInArray } from "drizzle-orm";
import { schema, type Db } from "@/lib/db";
import { gradeBet } from "@/lib/engine/grade";
import { sseHub } from "@/lib/sse";

function err(message: string, httpStatus = 400) {
  return Object.assign(new Error(message), { httpStatus });
}

function gradeMatchTickets(
  tx: Db,
  matchId: number,
  home: number,
  away: number,
  at: string,
) {
  const lines = new Map(
    tx
      .select()
      .from(schema.lines)
      .where(eq(schema.lines.matchId, matchId))
      .all()
      .map((l) => [l.id, l]),
  );
  const tickets = tx
    .select()
    .from(schema.bets)
    .where(
      and(eq(schema.bets.matchId, matchId), ne(schema.bets.status, "void")),
    )
    .all();
  for (const t of tickets) {
    const line = lines.get(t.lineId)!;
    const effHome = home - t.scoreHomeAtBet;
    const effAway = away - t.scoreAwayAtBet;
    const effFav = line.favSide === "home" ? effHome : effAway;
    const effDog = line.favSide === "home" ? effAway : effHome;
    const r = gradeBet({
      side: t.side,
      ballQ: line.ballQ,
      priceC: line.priceC,
      stake: t.stakeMmk,
      effFav: Math.max(effFav, 0),
      effDog: Math.max(effDog, 0),
    });
    tx.update(schema.bets)
      .set({ status: r.status, netMmk: r.netMmk, settledAt: at })
      .where(eq(schema.bets.id, t.id))
      .run();
  }
}

function maybeCloseDay(tx: Db, matchDay: string, at: string) {
  const unfinished = tx
    .select()
    .from(schema.matches)
    .where(
      and(
        eq(schema.matches.matchDay, matchDay),
        ne(schema.matches.status, "finished"),
      ),
    )
    .all();
  if (unfinished.length > 0) return;
  let day = tx
    .select()
    .from(schema.matchDays)
    .where(eq(schema.matchDays.date, matchDay))
    .get();
  if (!day)
    day = tx
      .insert(schema.matchDays)
      .values({ date: matchDay })
      .returning()
      .get();
  if (day.status === "open") {
    tx.update(schema.matchDays)
      .set({ status: "closed", closedAt: at })
      .where(eq(schema.matchDays.id, day.id))
      .run();
    sseHub.broadcast("day_closed", { date: matchDay });
  }
}

export function confirmFinalScore(
  db: Db,
  adminId: number,
  matchId: number,
  home: number,
  away: number,
  at: string,
) {
  if (
    !Number.isInteger(home) ||
    !Number.isInteger(away) ||
    home < 0 ||
    away < 0
  )
    throw err("invalid score");
  db.transaction((tx) => {
    const m = tx
      .select()
      .from(schema.matches)
      .where(eq(schema.matches.id, matchId))
      .get();
    if (!m) throw err("match not found", 404);
    if (m.status === "finished") throw err("already finished — use correction");
    tx.update(schema.matches)
      .set({
        status: "finished",
        homeScore: home,
        awayScore: away,
        scoreConfirmedAt: at,
      })
      .where(eq(schema.matches.id, matchId))
      .run();
    // close any open line
    const open = tx
      .select()
      .from(schema.lines)
      .where(
        and(
          eq(schema.lines.matchId, matchId),
          ne(schema.lines.status, "closed"),
        ),
      )
      .all();
    for (const l of open)
      tx.update(schema.lines)
        .set({ status: "closed" })
        .where(eq(schema.lines.id, l.id))
        .run();
    gradeMatchTickets(tx as unknown as Db, matchId, home, away, at);
    maybeCloseDay(tx as unknown as Db, m.matchDay, at);
  });
  sseHub.broadcast("match_final", {
    matchId,
    homeScore: home,
    awayScore: away,
  });
}

export function correctScore(
  db: Db,
  adminId: number,
  matchId: number,
  home: number,
  away: number,
  at: string,
) {
  db.transaction((tx) => {
    const m = tx
      .select()
      .from(schema.matches)
      .where(eq(schema.matches.id, matchId))
      .get();
    if (!m || m.status !== "finished") throw err("match is not finished");
    const day = tx
      .select()
      .from(schema.matchDays)
      .where(eq(schema.matchDays.date, m.matchDay))
      .get();
    if (day?.status === "settled")
      throw err("match day already settled — correction blocked");
    tx.update(schema.matches)
      .set({ homeScore: home, awayScore: away })
      .where(eq(schema.matches.id, matchId))
      .run();
    gradeMatchTickets(tx as unknown as Db, matchId, home, away, at);
    tx.insert(schema.auditLog)
      .values({
        actorId: adminId,
        action: "score_correction",
        subject: `match:${matchId}`,
        detail: `${home}-${away}`,
        at,
      })
      .run();
  });
  sseHub.broadcast("match_final", {
    matchId,
    homeScore: home,
    awayScore: away,
  });
}
```

- [ ] **Step 3: Run → PASS. Route `src/app/api/admin/scores/route.ts`**

```ts
import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { setMatchLive, updateLiveScore } from "@/lib/matches/score";
import { confirmFinalScore, correctScore } from "@/lib/bets/settleMatch";
import { ok, fail, handle } from "@/lib/api";
import { nowIso } from "@/lib/time";

export async function POST(req: Request) {
  return handle(async () => {
    const admin = await requireAdmin();
    const { action, matchId, home, away } = await req.json();
    const db = getDb();
    if (action === "live") setMatchLive(db, matchId);
    else if (action === "score") updateLiveScore(db, matchId, home, away);
    else if (action === "final")
      confirmFinalScore(db, admin.id, matchId, home, away, nowIso());
    else if (action === "correct")
      correctScore(db, admin.id, matchId, home, away, nowIso());
    else return fail("bad_action", "unknown action");
    return ok({});
  });
}
```

- [ ] **Step 4: Verify + commit**

```bash
npx tsc --noEmit && npx vitest run
git add src/lib/bets/settleMatch* src/app/api/admin/scores
git commit -m "feat: grading on final score, day close, corrections"
```

### Task 17: Accounting queries + settlement (mark paid) + void

**Files:**

- Create: `src/lib/accounting/queries.ts`, `src/lib/accounting/settle.ts`, `src/app/api/admin/settle/route.ts`, `src/app/api/balance/route.ts`
- Test: `src/lib/accounting/settle.test.ts`

- [ ] **Step 1: Failing test `src/lib/accounting/settle.test.ts`**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, schema, type Db } from "@/lib/db";
import { hashPin } from "@/lib/auth/pin";
import { postLine } from "@/lib/lines/manage";
import { placeBet } from "@/lib/bets/place";
import { confirmFinalScore } from "@/lib/bets/settleMatch";
import { dayBoard, playerDayItems } from "./queries";
import { markPlayerPaid, voidTicket } from "./settle";
import { eq } from "drizzle-orm";

let db: Db;
const NOW = "2026-06-12T10:00:00Z";

beforeEach(() => {
  db = createTestDb();
  db.insert(schema.players)
    .values([
      {
        phone: "09700000001",
        pinHash: hashPin("111111"),
        displayName: "Admin",
        role: "admin",
        createdAt: NOW,
      },
      {
        phone: "09700000002",
        pinHash: hashPin("222222"),
        displayName: "Zaw",
        createdAt: NOW,
      },
      {
        phone: "09700000003",
        pinHash: hashPin("333333"),
        displayName: "Thiri",
        createdAt: NOW,
      },
    ])
    .run();
  db.insert(schema.settings).values({ id: 1, dailyTotalLimitMmk: 0 }).run();
  db.insert(schema.matches)
    .values({
      stage: "Group C",
      homeTeam: "BRA",
      awayTeam: "MEX",
      kickoffUtc: "2026-06-12T02:00:00Z",
      venue: "X",
      matchDay: "2026-06-12",
    })
    .run();
  const line = postLine(
    db,
    1,
    { matchId: 1, favSide: "home", ballQ: 2, priceC: 90 },
    NOW,
  );
  placeBet(
    db,
    2,
    { matchId: 1, lineVersion: line.version, side: "fav", stakeMmk: 100_000 },
    NOW,
  ); // Zaw fav
  placeBet(
    db,
    3,
    { matchId: 1, lineVersion: line.version, side: "dog", stakeMmk: 200_000 },
    NOW,
  ); // Thiri dog
  confirmFinalScore(db, 1, 1, 2, 0, NOW); // BRA -0.5 covers → Zaw +90,000, Thiri −200,000
});

it("board shows nets and ticket items; marking paid stamps ref onto tickets", () => {
  const board = dayBoard(db, "2026-06-12");
  expect(board.day.status).toBe("closed");
  expect(board.rows).toEqual([
    expect.objectContaining({ playerId: 2, netMmk: 90_000, ticketCount: 1 }),
    expect.objectContaining({ playerId: 3, netMmk: -200_000, ticketCount: 1 }),
  ]);
  expect(board.houseNet).toBe(110_000);

  const s1 = markPlayerPaid(db, 1, "2026-06-12", 2, NOW);
  expect(s1.ref).toBe("S-0612-01");
  const s2 = markPlayerPaid(db, 1, "2026-06-12", 3, NOW);
  expect(s2.ref).toBe("S-0612-02");
  // every covered ticket stamped
  const zawItems = playerDayItems(db, 2, "2026-06-12");
  expect(zawItems[0].settlementId).toBe(s1.id);
  // all players paid → day settled
  expect(db.select().from(schema.matchDays).all()[0].status).toBe("settled");
  // double-pay rejected
  expect(() => markPlayerPaid(db, 1, "2026-06-12", 2, NOW)).toThrow(/already/);
});

it("cannot mark paid while day open; void excludes ticket from accounting", () => {
  db.update(schema.matchDays).set({ status: "open" }).run();
  expect(() => markPlayerPaid(db, 1, "2026-06-12", 2, NOW)).toThrow(
    /not closed/,
  );
  db.update(schema.matchDays).set({ status: "closed" }).run();

  const ticket = db
    .select()
    .from(schema.bets)
    .where(eq(schema.bets.playerId, 2))
    .get()!;
  voidTicket(db, 1, ticket.ticketNo, "admin error", NOW);
  const board = dayBoard(db, "2026-06-12");
  expect(board.rows.find((r) => r.playerId === 2)).toBeUndefined();
  expect(
    db
      .select()
      .from(schema.auditLog)
      .all()
      .some((a) => a.action === "void"),
  ).toBe(true);
});
```

- [ ] **Step 2: Run → FAIL. Implement `src/lib/accounting/queries.ts`**

```ts
import { and, eq, ne, isNotNull, sql } from "drizzle-orm";
import { schema, type Db } from "@/lib/db";

/** Graded, non-void tickets for a player on a match day, with line/match context. */
export function playerDayItems(db: Db, playerId: number, date: string) {
  return db
    .select({
      id: schema.bets.id,
      ticketNo: schema.bets.ticketNo,
      side: schema.bets.side,
      stakeMmk: schema.bets.stakeMmk,
      status: schema.bets.status,
      netMmk: schema.bets.netMmk,
      settlementId: schema.bets.settlementId,
      favSide: schema.lines.favSide,
      ballQ: schema.lines.ballQ,
      priceC: schema.lines.priceC,
      homeTeam: schema.matches.homeTeam,
      awayTeam: schema.matches.awayTeam,
    })
    .from(schema.bets)
    .innerJoin(schema.lines, eq(schema.bets.lineId, schema.lines.id))
    .innerJoin(schema.matches, eq(schema.bets.matchId, schema.matches.id))
    .where(
      and(
        eq(schema.bets.playerId, playerId),
        eq(schema.matches.matchDay, date),
        ne(schema.bets.status, "void"),
      ),
    )
    .all();
}

/** Per-player nets for a day (graded tickets only). */
export function dayBoard(db: Db, date: string) {
  const day = db
    .select()
    .from(schema.matchDays)
    .where(eq(schema.matchDays.date, date))
    .get() ?? { id: 0, date, status: "open" as const, closedAt: null };
  const rows = db
    .select({
      playerId: schema.bets.playerId,
      displayName: schema.players.displayName,
      netMmk: sql<number>`coalesce(sum(${schema.bets.netMmk}), 0)`,
      ticketCount: sql<number>`count(*)`,
      settled: sql<number>`max(${schema.bets.settlementId} is not null)`,
    })
    .from(schema.bets)
    .innerJoin(schema.matches, eq(schema.bets.matchId, schema.matches.id))
    .innerJoin(schema.players, eq(schema.bets.playerId, schema.players.id))
    .where(
      and(
        eq(schema.matches.matchDay, date),
        ne(schema.bets.status, "void"),
        isNotNull(schema.bets.netMmk),
      ),
    )
    .groupBy(schema.bets.playerId)
    .all();
  const houseNet = -rows.reduce((s, r) => s + r.netMmk, 0);
  return { day, rows, houseNet };
}
```

- [ ] **Step 3: Implement `src/lib/accounting/settle.ts`**

```ts
import { and, eq, ne } from "drizzle-orm";
import { schema, type Db } from "@/lib/db";
import { playerDayItems, dayBoard } from "./queries";

function err(message: string, httpStatus = 400) {
  return Object.assign(new Error(message), { httpStatus });
}

export function markPlayerPaid(
  db: Db,
  adminId: number,
  date: string,
  playerId: number,
  at: string,
) {
  return db.transaction((tx) => {
    const txd = tx as unknown as Db;
    const day = tx
      .select()
      .from(schema.matchDays)
      .where(eq(schema.matchDays.date, date))
      .get();
    if (!day || day.status === "open") throw err("match day not closed yet");
    const items = playerDayItems(txd, playerId, date);
    if (items.length === 0) throw err("no tickets for this player/day", 404);
    if (items.some((i) => i.settlementId != null)) throw err("already settled");

    const count = tx
      .select()
      .from(schema.settlements)
      .where(eq(schema.settlements.matchDayId, day.id))
      .all().length;
    const mmdd = date.slice(5, 7) + date.slice(8, 10);
    const ref = `S-${mmdd}-${String(count + 1).padStart(2, "0")}`;
    const net = items.reduce((s, i) => s + (i.netMmk ?? 0), 0);

    const settlement = tx
      .insert(schema.settlements)
      .values({
        ref,
        matchDayId: day.id,
        playerId,
        netMmk: net,
        markedBy: adminId,
        markedAt: at,
      })
      .returning()
      .get();
    for (const i of items)
      tx.update(schema.bets)
        .set({ settlementId: settlement.id })
        .where(eq(schema.bets.id, i.id))
        .run();

    // all players covered? → day settled
    const remaining = dayBoard(txd, date).rows.filter(
      (r) => !r.settled && r.playerId !== playerId,
    );
    if (remaining.length === 0)
      tx.update(schema.matchDays)
        .set({ status: "settled" })
        .where(eq(schema.matchDays.id, day.id))
        .run();
    return settlement;
  });
}

export function voidTicket(
  db: Db,
  adminId: number,
  ticketNo: string,
  reason: string,
  at: string,
) {
  const bet = db
    .select()
    .from(schema.bets)
    .where(eq(schema.bets.ticketNo, ticketNo))
    .get();
  if (!bet) throw err("ticket not found", 404);
  if (bet.settlementId != null)
    throw err("ticket already settled — cannot void");
  db.update(schema.bets)
    .set({
      status: "void",
      netMmk: null,
      voidedBy: adminId,
      voidReason: reason,
    })
    .where(eq(schema.bets.id, bet.id))
    .run();
  db.insert(schema.auditLog)
    .values({
      actorId: adminId,
      action: "void",
      subject: `ticket:${ticketNo}`,
      detail: reason,
      at,
    })
    .run();
}
```

- [ ] **Step 4: Run → PASS. Thin routes.**

`src/app/api/admin/settle/route.ts`:

```ts
import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { dayBoard } from "@/lib/accounting/queries";
import { markPlayerPaid, voidTicket } from "@/lib/accounting/settle";
import { ok, fail, handle } from "@/lib/api";
import { nowIso } from "@/lib/time";

export async function GET(req: Request) {
  return handle(async () => {
    await requireAdmin();
    const date = new URL(req.url).searchParams.get("date")!;
    return ok(dayBoard(getDb(), date));
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const admin = await requireAdmin();
    const body = await req.json();
    if (body.action === "mark_paid")
      return ok(
        markPlayerPaid(getDb(), admin.id, body.date, body.playerId, nowIso()),
      );
    if (body.action === "void") {
      voidTicket(getDb(), admin.id, body.ticketNo, body.reason ?? "", nowIso());
      return ok({});
    }
    return fail("bad_action", "unknown action");
  });
}
```

`src/app/api/balance/route.ts` (player view — current + previous days):

```ts
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requirePlayer } from "@/lib/auth/session";
import { playerDayItems } from "@/lib/accounting/queries";
import { ok, handle } from "@/lib/api";

export async function GET() {
  return handle(async () => {
    const me = await requirePlayer();
    const db = getDb();
    const days = db
      .select()
      .from(schema.matchDays)
      .orderBy(desc(schema.matchDays.date))
      .all();
    const refs = new Map(
      db
        .select()
        .from(schema.settlements)
        .where(eq(schema.settlements.playerId, me.id))
        .all()
        .map((s) => [s.matchDayId, s.ref]),
    );
    return ok(
      days
        .map((d) => ({
          date: d.date,
          status: d.status,
          ref: refs.get(d.id) ?? null,
          items: playerDayItems(db, me.id, d.date),
        }))
        .filter((d) => d.items.length > 0),
    );
  });
}
```

- [ ] **Step 5: Verify + commit**

```bash
npx tsc --noEmit && npx vitest run
git add src/lib/accounting src/app/api/admin/settle src/app/api/balance
git commit -m "feat: accounting queries, settlement refs, void, balance API"
```

### Task 18: Settings + dashboard APIs

**Files:**

- Create: `src/app/api/admin/settings/route.ts`, `src/lib/accounting/dashboard.ts`, `src/app/api/admin/dashboard/route.ts`
- Test: `src/lib/accounting/dashboard.test.ts`

- [ ] **Step 1: Failing test `src/lib/accounting/dashboard.test.ts`** (reuses the seeded scenario shape from Task 17's test — copy that `beforeEach` verbatim, then):

```ts
import { dashboard } from "./dashboard";

it("aggregates volume, exposure, and house P&L", () => {
  const d = dashboard(db, "2026-06-12");
  expect(d.todayHouseNet).toBe(110_000);
  expect(d.tournamentHouseNet).toBe(110_000);
  expect(d.todayStakeVolume).toBe(300_000);
  expect(d.todayBetCount).toBe(2);
  expect(d.activePlayers).toBe(2);
  expect(d.matches[0]).toEqual(
    expect.objectContaining({ matchId: 1, stakeVolume: 300_000, betCount: 2 }),
  );
});
```

- [ ] **Step 2: Run → FAIL. Implement `src/lib/accounting/dashboard.ts`**

```ts
import { and, eq, ne, isNotNull, sql } from "drizzle-orm";
import { schema, type Db } from "@/lib/db";

export function dashboard(db: Db, today: string) {
  const graded = and(
    ne(schema.bets.status, "void"),
    isNotNull(schema.bets.netMmk),
  );
  const sumNet = sql<number>`coalesce(sum(${schema.bets.netMmk}), 0)`;

  const tournament = db
    .select({ s: sumNet })
    .from(schema.bets)
    .where(graded)
    .get()!.s;
  const todayNet = db
    .select({ s: sumNet })
    .from(schema.bets)
    .innerJoin(schema.matches, eq(schema.bets.matchId, schema.matches.id))
    .where(and(graded, eq(schema.matches.matchDay, today)))
    .get()!.s;

  const todayBets = db
    .select({
      volume: sql<number>`coalesce(sum(${schema.bets.stakeMmk}), 0)`,
      count: sql<number>`count(*)`,
      players: sql<number>`count(distinct ${schema.bets.playerId})`,
    })
    .from(schema.bets)
    .innerJoin(schema.matches, eq(schema.bets.matchId, schema.matches.id))
    .where(
      and(ne(schema.bets.status, "void"), eq(schema.matches.matchDay, today)),
    )
    .get()!;

  const matches = db
    .select({
      matchId: schema.bets.matchId,
      stakeVolume: sql<number>`coalesce(sum(${schema.bets.stakeMmk}), 0)`,
      betCount: sql<number>`count(*)`,
    })
    .from(schema.bets)
    .innerJoin(schema.matches, eq(schema.bets.matchId, schema.matches.id))
    .where(
      and(ne(schema.bets.status, "void"), eq(schema.matches.matchDay, today)),
    )
    .groupBy(schema.bets.matchId)
    .all();

  return {
    todayHouseNet: -todayNet,
    tournamentHouseNet: -tournament,
    todayStakeVolume: todayBets.volume,
    todayBetCount: todayBets.count,
    activePlayers: todayBets.players,
    matches,
  };
}
```

- [ ] **Step 3: Run → PASS. Routes.**

`src/app/api/admin/dashboard/route.ts`:

```ts
import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { dashboard } from "@/lib/accounting/dashboard";
import { matchDayOf, nowIso } from "@/lib/time";
import { ok, handle } from "@/lib/api";

export async function GET() {
  return handle(async () => {
    await requireAdmin();
    return ok(dashboard(getDb(), matchDayOf(nowIso())));
  });
}
```

`src/app/api/admin/settings/route.ts`:

```ts
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { ok, handle } from "@/lib/api";
import { nowIso } from "@/lib/time";

export async function GET() {
  return handle(async () => {
    await requireAdmin();
    return ok(getDb().select().from(schema.settings).get());
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const admin = await requireAdmin();
    const { dailyTotalLimitMmk, matchId, betLimitMmk } = await req.json();
    const db = getDb();
    if (dailyTotalLimitMmk != null) {
      db.update(schema.settings)
        .set({ dailyTotalLimitMmk })
        .where(eq(schema.settings.id, 1))
        .run();
      db.insert(schema.auditLog)
        .values({
          actorId: admin.id,
          action: "limit_change",
          subject: "daily",
          detail: String(dailyTotalLimitMmk),
          at: nowIso(),
        })
        .run();
    }
    if (matchId != null) {
      db.update(schema.matches)
        .set({ betLimitMmk })
        .where(eq(schema.matches.id, matchId))
        .run();
      db.insert(schema.auditLog)
        .values({
          actorId: admin.id,
          action: "limit_change",
          subject: `match:${matchId}`,
          detail: String(betLimitMmk),
          at: nowIso(),
        })
        .run();
    }
    return ok({});
  });
}
```

- [ ] **Step 4: Verify + commit**

```bash
npx tsc --noEmit && npx vitest run
git add src/lib/accounting/dashboard* src/app/api/admin/dashboard src/app/api/admin/settings
git commit -m "feat: dashboard aggregates + limit settings with audit"
```

### Task 19: i18n (EN/MM)

**Files:**

- Create: `src/lib/i18n/en.ts`, `src/lib/i18n/mm.ts`, `src/lib/i18n/index.tsx`
- Test: `src/lib/i18n/i18n.test.ts`

- [ ] **Step 1: Failing test `src/lib/i18n/i18n.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { en } from "./en";
import { mm } from "./mm";

it("mm covers every en key", () => {
  expect(Object.keys(mm).sort()).toEqual(Object.keys(en).sort());
});
```

- [ ] **Step 2: Run → FAIL. Create `src/lib/i18n/en.ts`** — the full key set used by all screens:

```ts
export const en = {
  appName: "WorldBet2026",
  login: "Log in",
  register: "Register",
  logout: "Log out",
  phone: "Phone number",
  pin: "6-digit PIN",
  pinConfirm: "Confirm PIN",
  currentPin: "Current PIN",
  newPin: "New PIN",
  changePin: "Change PIN",
  inviteCode: "Invite code",
  displayName: "Your name",
  tabMatches: "Matches",
  tabBets: "My Bets",
  tabBalance: "Balance",
  live: "LIVE",
  suspended: "Suspended — line updating",
  finished: "FT",
  betSlip: "Bet slip",
  stake: "Stake (MMK)",
  confirmBet: "CONFIRM BET",
  scoreNow: "Score now",
  liveNote: "Only goals after this bet count",
  outWin: "Win",
  outHalfWin: "Half-win",
  outPush: "Push",
  outHalfLose: "Half-lose",
  outLose: "Lose",
  lineMoved: "Line moved — confirm the new price",
  ticket: "Bet Ticket",
  saveTicket: "Save ticket image",
  scanToVerify: "Scan to verify",
  player: "Player",
  match: "Match",
  pick: "Pick",
  placed: "Placed",
  statusLbl: "Status",
  scoreAtBet: "Score at bet",
  net: "Net",
  stPending: "PENDING",
  stWon: "WON",
  stHalfWon: "HALF WON",
  stPush: "PUSH",
  stHalfLost: "HALF LOST",
  stLost: "LOST",
  stVoid: "VOID",
  youPay: "You pay the house",
  housePays: "House pays you",
  evenDay: "Even",
  unsettled: "Unsettled",
  settledRef: "Settled",
  dayOpen: "Open",
  dayClosed: "Closed — settle today",
  daySettled: "Settled",
  errLocked: "Account locked — try later or ask admin",
  errWrong: "Wrong phone or PIN",
  language: "Language",
} as const;
export type Dict = Record<keyof typeof en, string>;
```

`src/lib/i18n/mm.ts` — same keys, Burmese values (machine-draft acceptable for MVP; spec §16 requires a native-speaker pass before launch). Example entries — complete all keys:

```ts
import type { Dict } from "./en";
export const mm: Dict = {
  appName: "WorldBet2026",
  login: "ဝင်မည်",
  register: "စာရင်းသွင်းမည်",
  logout: "ထွက်မည်",
  phone: "ဖုန်းနံပါတ်",
  pin: "PIN ၆ လုံး",
  pinConfirm: "PIN အတည်ပြုပါ",
  // ... every remaining key from en.ts, translated
} as const;
```

`src/lib/i18n/index.tsx` — context provider + hook:

```tsx
"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import { en, type Dict } from "./en";
import { mm } from "./mm";

const dicts: Record<"en" | "mm", Dict> = { en, mm };
const Ctx = createContext<{
  t: Dict;
  lang: "en" | "mm";
  setLang: (l: "en" | "mm") => void;
}>({ t: en, lang: "en", setLang: () => {} });

export function I18nProvider({
  initial,
  children,
}: {
  initial: "en" | "mm";
  children: ReactNode;
}) {
  const [lang, setLang] = useState<"en" | "mm">(initial);
  return (
    <Ctx.Provider value={{ t: dicts[lang], lang, setLang }}>
      {children}
    </Ctx.Provider>
  );
}

export const useT = () => useContext(Ctx);
```

- [ ] **Step 3: Run → PASS** (key-parity test keeps the two files honest forever).

- [ ] **Step 4: Commit** — `git add src/lib/i18n; git commit -m "feat: EN/MM dictionaries with parity test"`

### Task 20: Client plumbing — fetch helper, SSE hook, formatting

**Files:**

- Create: `src/lib/client/api.ts`, `src/lib/client/useSse.ts`, `src/lib/client/format.ts`

No unit tests (thin browser glue; exercised by every screen).

- [ ] **Step 1: `src/lib/client/api.ts`**

```ts
export async function api<T = unknown>(
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(
    path,
    body === undefined
      ? { cache: "no-store" }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const json = await res.json();
  if (!json.ok)
    throw Object.assign(new Error(json.message ?? "error"), {
      code: json.code,
      extra: json,
    });
  return json.data as T;
}
```

- [ ] **Step 2: `src/lib/client/useSse.ts`**

```ts
"use client";
import { useEffect, useRef } from "react";

/**
 * Subscribe to named SSE events; auto-reconnects (EventSource default).
 * IMPORTANT: handlers must capture only stable references (setState dispatchers,
 * module imports) — they are bound once at mount.
 * onReconnect fires after the stream re-opens following a drop (not on first open)
 * so callers can refetch state they may have missed.
 */
export function useSse(
  handlers: Record<string, (data: unknown) => void>,
  onReconnect?: () => void,
) {
  const openedOnce = useRef(false);
  useEffect(() => {
    const es = new EventSource("/api/stream");
    es.addEventListener("open", () => {
      if (openedOnce.current) onReconnect?.();
      openedOnce.current = true;
    });
    for (const [event, fn] of Object.entries(handlers))
      es.addEventListener(event, (e) =>
        fn(JSON.parse((e as MessageEvent).data)),
      );
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
```

- [ ] **Step 3: `src/lib/client/format.ts`**

```ts
export const mmk = (n: number) => n.toLocaleString("en-US");
export const signedMmk = (n: number) =>
  (n > 0 ? "+" : "") + n.toLocaleString("en-US");
export const ball = (q: number) => (q / 4).toString();
export const price = (c: number) => (c / 100).toFixed(2);
export function pickLabel(
  l: { favSide: "home" | "away"; ballQ: number; priceC: number },
  m: { homeTeam: string; awayTeam: string },
  side: "fav" | "dog",
) {
  const fav = l.favSide === "home" ? m.homeTeam : m.awayTeam;
  const dog = l.favSide === "home" ? m.awayTeam : m.homeTeam;
  return side === "fav"
    ? `${fav} −${ball(l.ballQ)} @ ${price(l.priceC)}`
    : `${dog} +${ball(l.ballQ)} @ ${price(l.priceC)}`;
}
```

- [ ] **Step 4: Build check + commit** — `npx tsc --noEmit; git add src/lib/client; git commit -m "feat: client api/SSE/format helpers"`

### Task 21: Auth screens + app shell

**Files:**

- Create: `src/app/(auth)/login/page.tsx`, `src/app/(auth)/register/page.tsx`
- Create: `src/app/(player)/layout.tsx` (session gate + tabs + I18nProvider)
- Modify: `src/app/layout.tsx` (strip scaffold boilerplate), delete `src/app/page.tsx` scaffold content (replaced in Task 22)

- [ ] **Step 1: `src/app/(auth)/login/page.tsx`**

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client/api";
import { useT, I18nProvider } from "@/lib/i18n";

function LoginForm() {
  const { t } = useT();
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  async function submit() {
    try {
      const me = await api<{ role: string; mustChangePin: boolean }>(
        "/api/auth/login",
        { phone, pin },
      );
      router.push(
        me.mustChangePin ? "/profile" : me.role === "admin" ? "/admin" : "/",
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-3 p-6">
      <h1 className="text-center text-3xl font-bold">⚽ {t.appName}</h1>
      <input
        className="rounded-xl border p-4 text-lg"
        inputMode="tel"
        placeholder={t.phone}
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />
      <input
        className="rounded-xl border p-4 text-lg tracking-widest"
        inputMode="numeric"
        maxLength={6}
        type="password"
        placeholder={t.pin}
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
      />
      {error && <p className="text-center text-red-600">{error}</p>}
      <button
        className="rounded-xl bg-green-700 p-4 text-lg font-bold text-white"
        onClick={submit}
      >
        {t.login}
      </button>
      <a className="text-center text-blue-600 underline" href="/register">
        {t.register}
      </a>
    </main>
  );
}

export default function LoginPage() {
  return (
    <I18nProvider initial="en">
      <LoginForm />
    </I18nProvider>
  );
}
```

- [ ] **Step 2: `src/app/(auth)/register/page.tsx`** — same shape with four fields (invite code, phone, name, PIN ×2), client-side check `pin === pinConfirm`, POST `/api/auth/register`, then `router.push('/')`. Reuse the exact input/button classes from Step 1. PIN mismatch shows inline error before any request.

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client/api";
import { useT, I18nProvider } from "@/lib/i18n";

function RegisterForm() {
  const { t } = useT();
  const router = useRouter();
  const [form, setForm] = useState({
    code: "",
    phone: "",
    name: "",
    pin: "",
    pin2: "",
  });
  const [error, setError] = useState("");
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({
      ...f,
      [k]:
        k === "pin" || k === "pin2"
          ? e.target.value.replace(/\D/g, "")
          : e.target.value,
    }));

  async function submit() {
    if (form.pin !== form.pin2) {
      setError(`${t.pin} ≠ ${t.pinConfirm}`);
      return;
    }
    try {
      await api("/api/auth/register", {
        code: form.code,
        phone: form.phone,
        name: form.name,
        pin: form.pin,
      });
      router.push("/");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-3 p-6">
      <h1 className="text-center text-2xl font-bold">{t.register}</h1>
      <input
        className="rounded-xl border p-4 text-lg"
        placeholder={t.inviteCode}
        value={form.code}
        onChange={set("code")}
      />
      <input
        className="rounded-xl border p-4 text-lg"
        inputMode="tel"
        placeholder={t.phone}
        value={form.phone}
        onChange={set("phone")}
      />
      <input
        className="rounded-xl border p-4 text-lg"
        placeholder={t.displayName}
        value={form.name}
        onChange={set("name")}
      />
      <input
        className="rounded-xl border p-4 text-lg tracking-widest"
        type="password"
        inputMode="numeric"
        maxLength={6}
        placeholder={t.pin}
        value={form.pin}
        onChange={set("pin")}
      />
      <input
        className="rounded-xl border p-4 text-lg tracking-widest"
        type="password"
        inputMode="numeric"
        maxLength={6}
        placeholder={t.pinConfirm}
        value={form.pin2}
        onChange={set("pin2")}
      />
      {error && <p className="text-center text-red-600">{error}</p>}
      <button
        className="rounded-xl bg-green-700 p-4 text-lg font-bold text-white"
        onClick={submit}
      >
        {t.register}
      </button>
    </main>
  );
}

export default function RegisterPage() {
  return (
    <I18nProvider initial="en">
      <RegisterForm />
    </I18nProvider>
  );
}
```

- [ ] **Step 3: `src/app/(player)/layout.tsx`** — server gate + tabs:

```tsx
import { redirect } from "next/navigation";
import { currentPlayer } from "@/lib/auth/session";
import { I18nProvider } from "@/lib/i18n";
import { Tabs } from "@/components/Tabs";

export default async function PlayerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await currentPlayer();
  if (!me) redirect("/login");
  if (me.mustChangePin) redirect("/profile");
  return (
    <I18nProvider initial={me.language}>
      <div className="mx-auto max-w-md pb-20">{children}</div>
      <Tabs isAdmin={me.role === "admin"} />
    </I18nProvider>
  );
}
```

`src/components/Tabs.tsx`:

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
    ...(isAdmin ? [{ href: "/admin", label: "🛠️" }] : []),
  ];
  return (
    <nav className="fixed bottom-0 left-0 right-0 mx-auto flex max-w-md border-t bg-white">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`flex-1 p-4 text-center font-medium ${path === tab.href ? "text-green-700" : "text-gray-500"}`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
```

- [ ] **Step 4: Clean scaffold** — in `src/app/layout.tsx` keep fonts/globals, set `<title>WorldBet2026</title>` and viewport meta; remove Next.js boilerplate content from the scaffold homepage (`src/app/page.tsx` moves to `src/app/(player)/page.tsx` in Task 22 — delete the scaffold version now).

- [ ] **Step 5: Verify + commit** — `npx tsc --noEmit && npm run build` → clean. `git add -A; git commit -m "feat: auth screens, player shell with tabs"`

### Task 22: Player screens — matches, bet slip, tickets, balance

**Files:**

- Create: `src/app/(player)/page.tsx`, `src/components/MatchCard.tsx`, `src/components/BetSlip.tsx`
- Create: `src/app/(player)/bets/page.tsx`, `src/components/TicketCard.tsx`
- Create: `src/app/(player)/balance/page.tsx`, `src/app/(player)/profile/page.tsx`

- [ ] **Step 1: Matches page `src/app/(player)/page.tsx`**

```tsx
"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { useSse } from "@/lib/client/useSse";
import { MatchCard, type MatchRow } from "@/components/MatchCard";
import { BetSlip, type SlipState } from "@/components/BetSlip";

export default function MatchesPage() {
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [slip, setSlip] = useState<SlipState | null>(null);

  const reload = () => api<MatchRow[]>("/api/matches").then(setMatches);
  useEffect(() => {
    reload();
  }, []);
  useSse({
    line_update: () => reload(),
    score_update: () => reload(),
    match_final: () => reload(),
  });

  const today = matches.filter((m) => m.status !== "finished");
  return (
    <main className="p-3">
      {today.map((m) => (
        <MatchCard
          key={m.id}
          match={m}
          onPick={(side) => m.line && setSlip({ match: m, line: m.line, side })}
        />
      ))}
      {slip && (
        <BetSlip
          slip={slip}
          onClose={() => setSlip(null)}
          onPlaced={() => {
            setSlip(null);
            reload();
          }}
        />
      )}
    </main>
  );
}
```

- [ ] **Step 2: `src/components/MatchCard.tsx`**

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
      className={`mb-3 rounded-xl border p-3 ${l?.status === "suspended" ? "opacity-50" : ""}`}
    >
      <div className="flex justify-between text-sm">
        <span className="font-semibold">
          {m.homeTeam} vs {m.awayTeam}{" "}
          <span className="text-gray-400">· {m.stage}</span>
        </span>
        {m.status === "live" ? (
          <span className="font-bold text-red-600">
            ● {t.live} {m.homeScore}–{m.awayScore}
          </span>
        ) : (
          <span className="text-gray-500">{kickoff}</span>
        )}
      </div>
      {!l && <p className="mt-2 text-center text-sm text-gray-400">—</p>}
      {l && l.status === "suspended" && (
        <p className="mt-2 text-center text-sm">⏸ {t.suspended}</p>
      )}
      {l && l.status === "active" && (
        <div className="mt-2 flex gap-2">
          <button
            className="flex-1 rounded-lg bg-green-50 p-3 font-semibold"
            onClick={() => onPick("fav")}
          >
            {fav} −{ball(l.ballQ)}
            <br />
            <span className="text-green-700">{price(l.priceC)}</span>
          </button>
          <button
            className="flex-1 rounded-lg bg-blue-50 p-3 font-semibold"
            onClick={() => onPick("dog")}
          >
            {dog} +{ball(l.ballQ)}
            <br />
            <span className="text-blue-700">{price(l.priceC)}</span>
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: `src/components/BetSlip.tsx`** — bottom sheet with chips and the five-outcome preview. Preview math mirrors `gradeBet`'s payout rule (display only; server remains authoritative):

```tsx
"use client";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { useT } from "@/lib/i18n";
import { mmk, signedMmk, pickLabel } from "@/lib/client/format";
import type { MatchRow, LineRow } from "./MatchCard";

export type SlipState = { match: MatchRow; line: LineRow; side: "fav" | "dog" };
const CHIPS = [10_000, 50_000, 100_000, 500_000, 1_000_000];

function preview(stake: number, priceC: number) {
  const win = priceC > 0 ? Math.round((stake * priceC) / 100) : stake;
  const lose = priceC > 0 ? stake : Math.round((stake * -priceC) / 100);
  return {
    win,
    halfWin: Math.round(win / 2),
    lose,
    halfLose: Math.round(lose / 2),
  };
}

export function BetSlip({
  slip,
  onClose,
  onPlaced,
}: {
  slip: SlipState;
  onClose: () => void;
  onPlaced: (ticket: unknown) => void;
}) {
  const { t } = useT();
  const [stake, setStake] = useState(100_000);
  const [error, setError] = useState("");
  const [line, setLine] = useState(slip.line);
  const p = preview(stake, line.priceC);

  async function confirm() {
    try {
      const ticket = await api("/api/bets", {
        matchId: slip.match.id,
        lineVersion: line.version,
        side: slip.side,
        stakeMmk: stake,
      });
      onPlaced(ticket);
      window.location.href = "/bets";
    } catch (e) {
      const ex = e as Error & { extra?: { currentLine?: LineRow } };
      if (ex.extra?.currentLine) {
        setLine(ex.extra.currentLine);
        setError(t.lineMoved);
      } else setError(ex.message);
    }
  }

  return (
    <div className="fixed inset-0 z-10 bg-black/40" onClick={onClose}>
      <div
        className="fixed bottom-0 left-0 right-0 mx-auto max-w-md rounded-t-2xl bg-white p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold">
          {pickLabel(line, slip.match, slip.side)}
        </h2>
        {slip.match.status === "live" && (
          <p className="text-sm text-red-600">
            {t.scoreNow}: {slip.match.homeScore}–{slip.match.awayScore} ·{" "}
            {t.liveNote}
          </p>
        )}
        <input
          className="my-3 w-full rounded-xl border p-4 text-xl"
          inputMode="numeric"
          value={mmk(stake)}
          onChange={(e) =>
            setStake(Number(e.target.value.replace(/\D/g, "")) || 0)
          }
        />
        <div className="flex flex-wrap gap-2">
          {CHIPS.map((c) => (
            <button
              key={c}
              className="rounded-lg bg-gray-100 px-3 py-2 text-sm"
              onClick={() => setStake(c)}
            >
              {c >= 1_000_000 ? `${c / 1_000_000}M` : `${c / 1_000}k`}
            </button>
          ))}
        </div>
        <div className="my-3 rounded-lg bg-gray-50 p-3 text-sm leading-6">
          {t.outWin}: <b className="text-green-700">{signedMmk(p.win)}</b> ·{" "}
          {t.outHalfWin}: {signedMmk(p.halfWin)}
          <br />
          {t.outLose}: <b className="text-red-600">{signedMmk(-p.lose)}</b> ·{" "}
          {t.outHalfLose}: {signedMmk(-p.halfLose)} · {t.outPush}: 0
        </div>
        {error && <p className="mb-2 text-center text-red-600">{error}</p>}
        <button
          className="w-full rounded-xl bg-green-700 p-4 text-lg font-bold text-white"
          onClick={confirm}
        >
          {t.confirmBet}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: `src/components/TicketCard.tsx`** — QR via `qrcode` data URL; "save image" uses a canvas render of the card (simplest robust path: draw text lines + QR onto a canvas, `toDataURL`, trigger download):

```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { useT } from "@/lib/i18n";
import { mmk, pickLabel } from "@/lib/client/format";

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

export function TicketCard({ ticket: b }: { ticket: TicketRow }) {
  const { t } = useT();
  const [qr, setQr] = useState("");
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    QRCode.toDataURL(b.qrUrl, { width: 160 }).then(setQr);
  }, [b.qrUrl]);

  async function save() {
    const canvas = document.createElement("canvas");
    canvas.width = 360;
    canvas.height = 560;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 360, 560);
    ctx.fillStyle = "#000";
    ctx.font = "bold 22px monospace";
    ctx.textAlign = "center";
    ctx.fillText(b.ticketNo, 180, 40);
    ctx.font = "15px sans-serif";
    ctx.textAlign = "left";
    const rows = [
      [t.player, b.playerName],
      [t.match, `${b.match.homeTeam} vs ${b.match.awayTeam}`],
      [t.pick, pickLabel(b.line, b.match, b.side)],
      [t.stake, `${mmk(b.stakeMmk)} MMK`],
      [t.scoreAtBet, `${b.scoreHomeAtBet}–${b.scoreAwayAtBet}`],
      [
        t.placed,
        new Date(b.placedAt).toLocaleString("en-GB", {
          timeZone: "Asia/Yangon",
        }),
      ],
      [t.statusLbl, b.status.toUpperCase()],
    ];
    rows.forEach(([k, v], idx) => {
      ctx.fillStyle = "#777";
      ctx.fillText(k, 24, 90 + idx * 30);
      ctx.fillStyle = "#000";
      ctx.fillText(v, 140, 90 + idx * 30);
    });
    if (qr) {
      const img = new Image();
      await new Promise((res) => {
        img.onload = res;
        img.src = qr;
      });
      ctx.drawImage(img, 100, 330, 160, 160);
    }
    const a = document.createElement("a");
    a.download = `${b.ticketNo}.png`;
    a.href = canvas.toDataURL("image/png");
    a.click();
  }

  return (
    <div>
      <div
        ref={cardRef}
        className="rounded-xl border-2 border-dashed border-gray-500 p-4 text-center"
      >
        <p className="text-xs text-gray-400">
          WORLDBET2026 · {t.ticket.toUpperCase()}
        </p>
        <p className="text-2xl font-bold tracking-widest">{b.ticketNo}</p>
        <hr className="my-2" />
        <dl className="text-left text-sm leading-7">
          <Row k={t.player} v={b.playerName} />
          <Row
            k={t.match}
            v={`${b.match.homeTeam} vs ${b.match.awayTeam} (${b.match.stage})`}
          />
          <Row k={t.pick} v={pickLabel(b.line, b.match, b.side)} />
          <Row k={t.stake} v={`${mmk(b.stakeMmk)} MMK`} />
          <Row k={t.scoreAtBet} v={`${b.scoreHomeAtBet}–${b.scoreAwayAtBet}`} />
          <Row k={t.statusLbl} v={b.status.toUpperCase()} />
          {b.netMmk != null && <Row k={t.net} v={`${mmk(b.netMmk)} MMK`} />}
        </dl>
        {qr && <img src={qr} alt="QR" className="mx-auto mt-2 h-40 w-40" />}
        <p className="text-xs text-gray-400">{t.scanToVerify}</p>
      </div>
      <button
        className="mt-2 w-full rounded-xl bg-gray-800 p-3 font-semibold text-white"
        onClick={save}
      >
        💾 {t.saveTicket}
      </button>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-gray-500">{k}</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  );
}
```

The `GET /api/bets` route must be extended to include `match`, `line`, and `playerName` per row (join as in `playerDayItems`) so `TicketRow` is fully populated — adjust the route from Task 13 accordingly when building this screen.

- [ ] **Step 5: `src/app/(player)/bets/page.tsx`** — fetch `/api/bets`, list compact rows (ticketNo, pick, stake, status badge), tap → full-screen `TicketCard` overlay. `src/app/(player)/balance/page.tsx` — fetch `/api/balance`, render one section per day: day status pill (`open`/`closed`/`settled` → `t.dayOpen`/`t.dayClosed`/`t.daySettled`), net total colored by sign with `t.youPay`/`t.housePays`, itemized ticket rows, settlement ref when present. `src/app/(player)/profile/page.tsx` — change-PIN form (current, new ×2 → POST `/api/auth/change-pin`), language toggle (POST to a tiny `/api/me` route that updates `players.language`; create it here), logout button. All three pages reuse components and helpers already defined; same Tailwind classes as the auth screens.

- [ ] **Step 6: Verify + commit**

```bash
npx tsc --noEmit && npm run build
git add src/app src/components
git commit -m "feat: player screens — matches, slip, tickets, balance, profile"
```

### Task 23: Admin screens

**Files:**

- Create: `src/app/admin/layout.tsx` (requireAdmin gate, same I18nProvider), `src/app/admin/page.tsx` (dashboard), `src/app/admin/lines/page.tsx`, `src/app/admin/scores/page.tsx`, `src/app/admin/settle/page.tsx`, `src/app/admin/players/page.tsx`, `src/app/admin/settings/page.tsx`

All admin pages are client components fetching the admin APIs already built (Tasks 9, 11, 15–18). They share the player app's helpers. Layout mirrors `(player)/layout.tsx` but checks `me.role === 'admin'` (redirect `/` otherwise) and renders a top nav of links instead of bottom tabs.

- [ ] **Step 1: `src/app/admin/layout.tsx`**

```tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { currentPlayer } from "@/lib/auth/session";
import { I18nProvider } from "@/lib/i18n";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await currentPlayer();
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect("/");
  const nav = [
    ["/admin", "Overview"],
    ["/admin/lines", "Lines"],
    ["/admin/scores", "Scores"],
    ["/admin/settle", "Settle"],
    ["/admin/players", "Players"],
    ["/admin/settings", "Settings"],
  ];
  return (
    <I18nProvider initial={me.language}>
      <nav className="flex gap-3 overflow-x-auto border-b bg-amber-50 p-3 text-sm font-semibold">
        {nav.map(([href, label]) => (
          <Link key={href} href={href}>
            {label}
          </Link>
        ))}
      </nav>
      <div className="mx-auto max-w-md p-3">{children}</div>
    </I18nProvider>
  );
}
```

- [ ] **Step 2: Dashboard `src/app/admin/page.tsx`** — fetch `/api/admin/dashboard`; stat cards (today house net, tournament net, volume, bet count, active players) + per-match volume table. Numbers via `signedMmk`/`mmk`; house net green when positive, red when negative.

- [ ] **Step 3: Lines desk `src/app/admin/lines/page.tsx`** — list today's + live matches (reuse `/api/matches`); per match: current line summary, then a compact form: fav side select (home/away), ball stepper (±0.25 steps shown in goals, stored ×4), Malay price input (−1.00..1.00 in 0.01 steps, stored ×100, validated ≠ 0), POST `{action:'post'}`; buttons for suspend/resume/close; per-match limit input POSTing to `/api/admin/settings` `{matchId, betLimitMmk}`.

- [ ] **Step 4: Scores `src/app/admin/scores/page.tsx`** — per match: "kick off" (`{action:'live'}`), score steppers POSTing `{action:'score'}` on each change, "confirm final" with a confirm dialog (`{action:'final'}`), and for finished matches a "correct score" flow (`{action:'correct'}`).

- [ ] **Step 5: Settle `src/app/admin/settle/page.tsx`** — date picker defaulting to today (MMT); fetch `/api/admin/settle?date=…`; day status + house net header; player rows (name, signed net, ticket count) expanding to ticket ID lists; "mark paid" button per row POSTing `{action:'mark_paid'}`, disabled once settled; void flow: tap a ticket ID → confirm dialog with reason input → `{action:'void'}`.

- [ ] **Step 6: Players + Settings.** `players/page.tsx`: list from `/api/admin/players`; per player: reset PIN (prompt for temp 6-digit PIN), unlock if locked, grant admin; invites section: list + create form (max uses, expiry date) via `/api/admin/invites`. `settings/page.tsx`: daily total limit input (MMK, 0 = unlimited) POSTing `/api/admin/settings`.

- [ ] **Step 7: Verify + commit**

```bash
npx tsc --noEmit && npm run build
git add src/app/admin
git commit -m "feat: admin screens — dashboard, lines, scores, settle, players, settings"
```

### Task 24: End-to-end smoke, backup, deploy

**Files:**

- Create: `scripts/backup.sh`, `docs/DEPLOY.md`
- Modify: `CLAUDE.md` (commands section)

- [ ] **Step 1: Full-flow manual smoke test** (dev server, two browser profiles):

1. `npm run db:migrate && npm run db:seed && npm run db:create-admin 09700000001 111111 Admin`
2. Admin: log in → create invite code → post a line on today's match.
3. Player profile: register with the code → see the line → place a 50,000 bet → ticket renders with QR → save image works.
4. Scan/open the QR URL logged out → VERIFIED page. Mangle a sig char → NOT VALID.
5. Admin: suspend the line → player's card grays out within ~1s (SSE). Resume, move the line → player's open slip re-confirms at the new price on submit.
6. Admin: kick off, set score 1–0, player places a live dog bet, confirm final 2–1 → both tickets grade per spec math; day closes (single-match day).
7. Settle board: nets correct, mark each player paid → refs `S-MMDD-01…`; day shows settled; player balance shows the ref.
8. Limits: set daily limit below an attempted stake → clear rejection with headroom; per-match limit carve-out behaves per Task 13's test.
9. Lockout: 5 wrong PINs → locked message; admin unlock + reset PIN → forced change on next login.

Expected: every step behaves as written; fix anything that doesn't before proceeding.

- [ ] **Step 2: `scripts/backup.sh`** + cron

```bash
#!/usr/bin/env bash
# Nightly SQLite backup with 14-day retention.
set -euo pipefail
DB="${1:-/mnt/hermes-data/mmzphyo/Projects/WorldBet2026/worldbet.db}"
DEST="${2:-$HOME/worldbet-backups}"
mkdir -p "$DEST"
STAMP=$(date +%Y%m%d-%H%M)
sqlite3 "$DB" ".backup '$DEST/worldbet-$STAMP.db'"
find "$DEST" -name 'worldbet-*.db' -mtime +14 -delete
```

Install: `chmod +x scripts/backup.sh && (crontab -l 2>/dev/null; echo "30 18 * * * /mnt/hermes-data/mmzphyo/Projects/WorldBet2026/scripts/backup.sh") | crontab -` (18:30 UTC = 01:00 MMT). Verify with `crontab -l` and one manual run.

- [ ] **Step 3: `docs/DEPLOY.md`** — production run instructions: `npm run build`; `npm start` under a process manager (systemd unit example below); HTTPS via Caddy or nginx + Let's Encrypt in front (required: cookies are `secure`, QR URLs use `APP_ORIGIN`); env checklist (`DATABASE_PATH`, `SESSION_SECRET`, `TICKET_SECRETS`, `APP_ORIGIN`); first-run: migrate, seed, create-admin. Include the systemd unit:

```ini
[Unit]
Description=WorldBet2026
After=network.target

[Service]
WorkingDirectory=/mnt/hermes-data/mmzphyo/Projects/WorldBet2026
ExecStart=/usr/bin/npm start
Restart=always
EnvironmentFile=/mnt/hermes-data/mmzphyo/Projects/WorldBet2026/.env.local

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 4: Update `CLAUDE.md`** commands section — add `npm test`, `npm run db:migrate`, `npm run db:seed`, `npm run db:create-admin`, and a line: "Money is integer MMK; Malay prices ×100 (`priceC`); handicap balls ×4 (`ballQ`). Grading logic lives in `src/lib/engine/grade.ts` — change only with its test table."

- [ ] **Step 5: Final verify + commit**

```bash
npx tsc --noEmit && npx vitest run && npm run build
git add scripts/backup.sh docs/DEPLOY.md CLAUDE.md
git commit -m "chore: smoke test pass, backup script, deploy docs"
```

---

## Self-review checklist (run after drafting; keep results here)

- **Spec coverage:** §3 architecture → T1–2, 10; §4 auth → T6–9; §5 data → T2; §6 lines → T11, 15; §7 betting → T13, 22; §8 limits → T13, 18; §9 tickets/QR → T12, 14, 22; §10 grading → T4, 16; §11 accounting → T17; §12 admin (incl. dashboard) → T9, 18, 23; §13 fixtures → T5; §14 errors → woven through T8/11/13/16/17; §15 testing → every task's test steps; §16 backup → T24. i18n (§3) → T19. No gaps found.
- **Type consistency:** `ballQ`/`priceC`/`stakeMmk`/`netMmk` naming and ×4/×100 encodings are uniform across engine, schema, routes, and UI; `Db` type exported once from `src/lib/db`; error shape `{ httpStatus }` consumed by `handle()` everywhere.
- **Known simplifications (intentional):** match list returns all 104 matches unfiltered (client groups; trivial data size); SSE reloads the whole match list on any event (correct and simple at this scale); ticket-number collision handled by unique-index failure, not retry.
