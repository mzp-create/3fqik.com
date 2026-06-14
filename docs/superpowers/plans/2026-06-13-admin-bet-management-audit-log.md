# Admin Bet-Management Page + Audit-Log View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a paginated admin bet-management page at `/admin/bets` (with inline void action) and a read-only audit-log page at `/admin/audit`, both backed by new GET-only API routes.

**Architecture:** Two new API routes (`/api/admin/bets`, `/api/admin/audit`) query the SQLite DB with drizzle-orm joins and return typed JSON via the existing `ok`/`handle` helpers. Two new `'use client'` pages consume them with filter state and render expandable rows that reuse the `gradeDetail` breakdown pattern already in the settle page. The void action POSTs to the **existing** `/api/admin/settle` endpoint (no new mutations). Nav links are added to `layout.tsx`.

**Tech Stack:** Next.js 16 App Router, drizzle-orm/better-sqlite3, TypeScript, Tailwind CSS, Vitest

---

## File Map

| Action | Path                                    | Responsibility                                             |
| ------ | --------------------------------------- | ---------------------------------------------------------- |
| Create | `src/app/api/admin/bets/route.ts`       | GET /api/admin/bets — filtered bet list with joins         |
| Create | `src/app/api/admin/audit/route.ts`      | GET /api/admin/audit — last 200 audit rows with actor name |
| Create | `src/app/admin/bets/page.tsx`           | Client page: filter bar, expandable bet rows, inline void  |
| Create | `src/app/admin/audit/page.tsx`          | Client page: read-only audit log table                     |
| Modify | `src/app/admin/layout.tsx`              | Add Bets + Audit nav links                                 |
| Create | `src/app/api/admin/bets/route.test.ts`  | Unit tests for the bets query logic                        |
| Create | `src/app/api/admin/audit/route.test.ts` | Unit tests for the audit query logic                       |

---

### Task 1: GET /api/admin/bets route

**Files:**

- Create: `src/app/api/admin/bets/route.ts`

- [ ] **Step 1.1: Write the failing test**

Create `src/app/api/admin/bets/route.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, schema, type Db } from "@/lib/db";
import { hashPin } from "@/lib/auth/pin";
import { postLine } from "@/lib/lines/manage";
import { placeBet } from "@/lib/bets/place";
import { confirmFinalScore } from "@/lib/bets/settleMatch";
import { voidTicket } from "@/lib/accounting/settle";
import { getAllBets, BetsFilter } from "./route";

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
    { matchId: 1, market: "ah", favSide: "home", ballQ: 2, priceC: 90 },
    NOW,
  );
  placeBet(
    db,
    2,
    {
      matchId: 1,
      market: "ah",
      lineVersion: line.version,
      side: "fav",
      stakeMmk: 100_000,
    },
    NOW,
  );
  confirmFinalScore(db, 1, 1, 2, 0, NOW);
});

describe("getAllBets", () => {
  it("returns all bets with player name and match info", () => {
    const result = getAllBets(db, {});
    expect(result.rows).toHaveLength(1);
    const row = result.rows[0];
    expect(row.playerName).toBe("Zaw");
    expect(row.homeTeam).toBe("BRA");
    expect(row.awayTeam).toBe("MEX");
    expect(row.market).toBe("ah");
    expect(row.status).toBe("won");
    expect(result.capped).toBe(false);
  });

  it("filters by status=pending returns empty when bet is won", () => {
    const result = getAllBets(db, { status: "pending" });
    expect(result.rows).toHaveLength(0);
  });

  it("filters by status=won returns the won bet", () => {
    const result = getAllBets(db, { status: "won" });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].status).toBe("won");
  });

  it("filters by q matching player name (case-insensitive)", () => {
    const result = getAllBets(db, { q: "zaw" });
    expect(result.rows).toHaveLength(1);
    const resultNone = getAllBets(db, { q: "nobody" });
    expect(resultNone.rows).toHaveLength(0);
  });

  it("filters by q matching home team", () => {
    const result = getAllBets(db, { q: "bra" });
    expect(result.rows).toHaveLength(1);
  });

  it("resolves voidedBy to display_name", () => {
    const bet = db.select().from(schema.bets).get()!;
    voidTicket(db, 1, bet.ticketNo, "test void", NOW);
    const result = getAllBets(db, { status: "void" });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].voidedBy).toBe("Admin");
    expect(result.rows[0].voidReason).toBe("test void");
  });
});
```

- [ ] **Step 1.2: Run test to verify it fails**

```bash
cd /mnt/hermes-data/mmzphyo/Projects/WorldBet2026 && npx vitest run src/app/api/admin/bets/route.test.ts 2>&1 | tail -20
```

Expected: FAIL — `getAllBets` not found / module not found.

- [ ] **Step 1.3: Create the route with exported query function**

Create `src/app/api/admin/bets/route.ts`:

```typescript
import { and, desc, eq, like, or, sql } from "drizzle-orm";
import { getDb, schema, type Db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { ok, handle } from "@/lib/api";

export type BetsFilter = {
  status?: string;
  q?: string;
};

type BetRow = {
  ticketNo: string;
  playerId: number;
  playerName: string;
  market: "ah" | "ou";
  side: "fav" | "dog" | "over" | "under";
  ballQ: number;
  priceC: number;
  stakeMmk: number;
  scoreHomeAtBet: number;
  scoreAwayAtBet: number;
  status: string;
  netMmk: number | null;
  settlementId: number | null;
  placedAt: string;
  favSide: "home" | "away";
  homeTeam: string;
  awayTeam: string;
  stage: string;
  matchStatus: string;
  finalHome: number | null;
  finalAway: number | null;
  voidedBy: string | null;
  voidReason: string | null;
};

const CAP = 500;

export function getAllBets(
  db: Db,
  filter: BetsFilter,
): { rows: BetRow[]; capped: boolean } {
  // Alias for the voider player join
  const voiders = schema.players;

  // Build a base query without the voider join first, then resolve voidedBy in JS
  // (drizzle-orm sqlite doesn't easily support two self-joins on the same table;
  //  we do a second lookup per-row only when voidedBy is set — max 500 rows, acceptable)
  const statusFilter =
    filter.status && filter.status !== "all"
      ? eq(schema.bets.status, filter.status)
      : undefined;

  const qLower = filter.q ? `%${filter.q.toLowerCase()}%` : undefined;
  const searchFilter = qLower
    ? or(
        like(sql`lower(${schema.bets.ticketNo})`, qLower),
        like(sql`lower(${schema.players.displayName})`, qLower),
        like(sql`lower(${schema.matches.homeTeam})`, qLower),
        like(sql`lower(${schema.matches.awayTeam})`, qLower),
      )
    : undefined;

  const whereClause =
    statusFilter && searchFilter
      ? and(statusFilter, searchFilter)
      : (statusFilter ?? searchFilter);

  const rows = db
    .select({
      ticketNo: schema.bets.ticketNo,
      playerId: schema.bets.playerId,
      playerName: schema.players.displayName,
      market: schema.lines.market,
      side: schema.bets.side,
      ballQ: schema.lines.ballQ,
      priceC: schema.lines.priceC,
      stakeMmk: schema.bets.stakeMmk,
      scoreHomeAtBet: schema.bets.scoreHomeAtBet,
      scoreAwayAtBet: schema.bets.scoreAwayAtBet,
      status: schema.bets.status,
      netMmk: schema.bets.netMmk,
      settlementId: schema.bets.settlementId,
      placedAt: schema.bets.placedAt,
      favSide: schema.lines.favSide,
      homeTeam: schema.matches.homeTeam,
      awayTeam: schema.matches.awayTeam,
      stage: schema.matches.stage,
      matchStatus: schema.matches.status,
      finalHome: schema.matches.homeScore,
      finalAway: schema.matches.awayScore,
      voidedById: schema.bets.voidedBy,
      voidReason: schema.bets.voidReason,
    })
    .from(schema.bets)
    .innerJoin(schema.players, eq(schema.bets.playerId, schema.players.id))
    .innerJoin(schema.lines, eq(schema.bets.lineId, schema.lines.id))
    .innerJoin(schema.matches, eq(schema.bets.matchId, schema.matches.id))
    .where(whereClause)
    .orderBy(desc(schema.bets.placedAt))
    .limit(CAP + 1)
    .all();

  const capped = rows.length > CAP;
  const limited = capped ? rows.slice(0, CAP) : rows;

  // Resolve voidedBy ID → display_name
  const voidedByIds = [
    ...new Set(
      limited.map((r) => r.voidedById).filter((id): id is number => id != null),
    ),
  ];
  const voiderMap = new Map<number, string>();
  for (const id of voidedByIds) {
    const p = db
      .select({ displayName: voiders.displayName })
      .from(voiders)
      .where(eq(voiders.id, id))
      .get();
    if (p) voiderMap.set(id, p.displayName);
  }

  return {
    rows: limited.map(({ voidedById, ...rest }) => ({
      ...rest,
      voidedBy: voidedById != null ? (voiderMap.get(voidedById) ?? null) : null,
    })),
    capped,
  };
}

export async function GET(req: Request) {
  return handle(async () => {
    await requireAdmin();
    const sp = new URL(req.url).searchParams;
    const filter: BetsFilter = {
      status: sp.get("status") ?? undefined,
      q: sp.get("q") ?? undefined,
    };
    const db = getDb();
    const { rows, capped } = getAllBets(db, filter);
    return ok({
      rows,
      capped,
      note: capped
        ? "Results capped at 500. Use filters to narrow down."
        : null,
    });
  });
}
```

- [ ] **Step 1.4: Run tests to verify they pass**

```bash
cd /mnt/hermes-data/mmzphyo/Projects/WorldBet2026 && npx vitest run src/app/api/admin/bets/route.test.ts 2>&1 | tail -20
```

Expected: All tests PASS.

- [ ] **Step 1.5: Commit**

```bash
cd /mnt/hermes-data/mmzphyo/Projects/WorldBet2026 && git add src/app/api/admin/bets/route.ts src/app/api/admin/bets/route.test.ts && git commit -m "feat: GET /api/admin/bets with status + q filters"
```

---

### Task 2: GET /api/admin/audit route

**Files:**

- Create: `src/app/api/admin/audit/route.ts`
- Create: `src/app/api/admin/audit/route.test.ts`

- [ ] **Step 2.1: Write the failing test**

Create `src/app/api/admin/audit/route.test.ts`:

```typescript
import { it, expect, beforeEach } from "vitest";
import { createTestDb, schema, type Db } from "@/lib/db";
import { hashPin } from "@/lib/auth/pin";
import { getAuditLog } from "./route";

let db: Db;
const NOW = "2026-06-12T10:00:00Z";

beforeEach(() => {
  db = createTestDb();
  db.insert(schema.players)
    .values([
      {
        phone: "09700000001",
        pinHash: hashPin("111111"),
        displayName: "AdminUser",
        role: "admin",
        createdAt: NOW,
      },
    ])
    .run();
});

it("returns audit rows with actor name resolved", () => {
  db.insert(schema.auditLog)
    .values({
      actorId: 1,
      action: "void",
      subject: "ticket:T-001",
      detail: "admin error",
      at: NOW,
    })
    .run();

  const rows = getAuditLog(db);
  expect(rows).toHaveLength(1);
  expect(rows[0].actorName).toBe("AdminUser");
  expect(rows[0].action).toBe("void");
  expect(rows[0].subject).toBe("ticket:T-001");
});

it("shows 'system' when actorId is 0", () => {
  db.insert(schema.auditLog)
    .values({
      actorId: 0,
      action: "score_correction",
      subject: "match:1",
      detail: "automated",
      at: NOW,
    })
    .run();

  const rows = getAuditLog(db);
  expect(rows[0].actorName).toBe("system");
});

it("returns newest-first, capped at 200", () => {
  const entries = Array.from({ length: 5 }, (_, i) => ({
    actorId: 1,
    action: "void",
    subject: `ticket:T-${String(i).padStart(3, "0")}`,
    detail: null,
    at: `2026-06-12T${String(10 + i).padStart(2, "0")}:00:00Z`,
  }));
  db.insert(schema.auditLog).values(entries).run();

  const rows = getAuditLog(db);
  expect(rows).toHaveLength(5);
  // newest first
  expect(rows[0].at > rows[1].at).toBe(true);
});
```

- [ ] **Step 2.2: Run test to verify it fails**

```bash
cd /mnt/hermes-data/mmzphyo/Projects/WorldBet2026 && npx vitest run src/app/api/admin/audit/route.test.ts 2>&1 | tail -20
```

Expected: FAIL — `getAuditLog` not found.

- [ ] **Step 2.3: Create the audit route**

Create `src/app/api/admin/audit/route.ts`:

```typescript
import { desc } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { getDb, schema, type Db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { ok, handle } from "@/lib/api";

type AuditRow = {
  id: number;
  at: string;
  action: string;
  subject: string;
  detail: string | null;
  actorId: number;
  actorName: string;
};

const CAP = 200;

export function getAuditLog(db: Db): AuditRow[] {
  const rows = db
    .select()
    .from(schema.auditLog)
    .orderBy(desc(schema.auditLog.at))
    .limit(CAP)
    .all();

  // Resolve actorId → display_name; cache to avoid re-querying the same ID
  const nameCache = new Map<number, string>();

  return rows.map((row) => {
    let actorName: string;
    if (row.actorId === 0) {
      actorName = "system";
    } else {
      if (!nameCache.has(row.actorId)) {
        const p = db
          .select({ displayName: schema.players.displayName })
          .from(schema.players)
          .where(eq(schema.players.id, row.actorId))
          .get();
        nameCache.set(row.actorId, p?.displayName ?? "system");
      }
      actorName = nameCache.get(row.actorId)!;
    }
    return { ...row, actorName };
  });
}

export async function GET() {
  return handle(async () => {
    await requireAdmin();
    const rows = getAuditLog(getDb());
    return ok(rows);
  });
}
```

- [ ] **Step 2.4: Run tests to verify they pass**

```bash
cd /mnt/hermes-data/mmzphyo/Projects/WorldBet2026 && npx vitest run src/app/api/admin/audit/route.test.ts 2>&1 | tail -20
```

Expected: All tests PASS.

- [ ] **Step 2.5: Commit**

```bash
cd /mnt/hermes-data/mmzphyo/Projects/WorldBet2026 && git add src/app/api/admin/audit/route.ts src/app/api/admin/audit/route.test.ts && git commit -m "feat: GET /api/admin/audit with actor name resolution"
```

---

### Task 3: Add Bets + Audit to admin nav

**Files:**

- Modify: `src/app/admin/layout.tsx`

- [ ] **Step 3.1: Edit the nav array**

In `src/app/admin/layout.tsx`, find the `nav` array and add Bets after Settle and Audit after Bets:

Old:

```typescript
const nav = [
  ["/admin", "Overview"],
  ["/admin/lines", "Lines"],
  ["/admin/scores", "Scores"],
  ["/admin/settle", "Settle"],
  ["/admin/players", "Players"],
  ["/admin/settings", "Settings"],
];
```

New:

```typescript
const nav = [
  ["/admin", "Overview"],
  ["/admin/lines", "Lines"],
  ["/admin/scores", "Scores"],
  ["/admin/settle", "Settle"],
  ["/admin/bets", "Bets"],
  ["/admin/audit", "Audit"],
  ["/admin/players", "Players"],
  ["/admin/settings", "Settings"],
];
```

- [ ] **Step 3.2: TypeScript check**

```bash
cd /mnt/hermes-data/mmzphyo/Projects/WorldBet2026 && npx tsc --noEmit 2>&1 | head -30
```

Expected: No errors.

- [ ] **Step 3.3: Commit**

```bash
cd /mnt/hermes-data/mmzphyo/Projects/WorldBet2026 && git add src/app/admin/layout.tsx && git commit -m "feat: add Bets + Audit links to admin nav"
```

---

### Task 4: /admin/bets page

**Files:**

- Create: `src/app/admin/bets/page.tsx`

Note: This is a 'use client' page. It fetches `/api/admin/bets`, renders a filter bar, expandable rows with gradeDetail breakdown (same logic as settle/page.tsx), and a Void button that POSTs to the existing `/api/admin/settle` endpoint.

- [ ] **Step 4.1: Create the page**

Create `src/app/admin/bets/page.tsx`:

```typescript
"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { mmk, signedMmk, ball, price, pickLabel } from "@/lib/client/format";
import { gradeDetail } from "@/lib/engine/grade";
import type { GradeInput } from "@/lib/engine/grade";

type BetRow = {
  ticketNo: string;
  playerId: number;
  playerName: string;
  market: "ah" | "ou";
  side: "fav" | "dog" | "over" | "under";
  ballQ: number;
  priceC: number;
  stakeMmk: number;
  scoreHomeAtBet: number;
  scoreAwayAtBet: number;
  status: string;
  netMmk: number | null;
  settlementId: number | null;
  placedAt: string;
  favSide: "home" | "away";
  homeTeam: string;
  awayTeam: string;
  stage: string;
  matchStatus: string;
  finalHome: number | null;
  finalAway: number | null;
  voidedBy: string | null;
  voidReason: string | null;
};

type BetsResponse = {
  rows: BetRow[];
  capped: boolean;
  note: string | null;
};

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
  { value: "push", label: "Push" },
  { value: "void", label: "Void" },
];

function statusBadge(status: string) {
  const base = "text-xs px-2 py-0.5 rounded font-semibold";
  switch (status) {
    case "won":
      return <span className={`${base} bg-green-100 text-green-700`}>won</span>;
    case "lost":
      return <span className={`${base} bg-red-100 text-red-600`}>lost</span>;
    case "void":
      return <span className={`${base} bg-gray-100 text-gray-500`}>void</span>;
    case "pending":
      return <span className={`${base} bg-blue-100 text-blue-700`}>pending</span>;
    case "push":
      return <span className={`${base} bg-gray-100 text-gray-600`}>push</span>;
    default:
      return <span className={`${base} bg-gray-100 text-gray-500`}>{status}</span>;
  }
}

function GradeBreakdown({ t }: { t: BetRow }) {
  if (t.status === "void") {
    return (
      <div className="text-xs text-gray-500 mt-1 italic">
        VOIDED by {t.voidedBy ?? "unknown"}: {t.voidReason ?? ""}
      </div>
    );
  }

  if (t.matchStatus !== "finished" || t.finalHome == null || t.finalAway == null) {
    return (
      <div className="text-xs text-gray-400 mt-1 italic">not yet graded</div>
    );
  }

  if (t.netMmk == null) {
    return (
      <div className="text-xs text-gray-400 mt-1 italic">not yet graded</div>
    );
  }

  try {
    const finalHome = t.finalHome;
    const finalAway = t.finalAway;
    const effHome = Math.max(finalHome - t.scoreHomeAtBet, 0);
    const effAway = Math.max(finalAway - t.scoreAwayAtBet, 0);
    const effFav = t.favSide === "home" ? effHome : effAway;
    const effDog = t.favSide === "home" ? effAway : effHome;

    const d = gradeDetail({
      market: t.market,
      side: t.side,
      ballQ: t.ballQ,
      priceC: t.priceC,
      stake: t.stakeMmk,
      effFav,
      effDog,
    } as GradeInput);

    const fav = t.favSide === "home" ? t.homeTeam : t.awayTeam;
    const dog = t.favSide === "home" ? t.awayTeam : t.homeTeam;

    const isLive = t.scoreHomeAtBet !== 0 || t.scoreAwayAtBet !== 0;
    const scoreLine = isLive
      ? `Bet at ${t.scoreHomeAtBet}–${t.scoreAwayAtBet} · final ${finalHome}–${finalAway} · counts after-bet goals: ${effHome}–${effAway}`
      : `Final ${finalHome}–${finalAway}`;

    let mathLine: string;
    if (t.market === "ah") {
      const sign = t.side === "fav" ? "−" : "+";
      const handicapGoals = ball(t.ballQ);
      const teamLabel = t.side === "fav" ? fav : dog;
      mathLine = `${teamLabel} ${sign}${handicapGoals}: effective ${effFav}–${effDog}, d=${d.d > 0 ? "+" : ""}${d.d} → ${d.kind}`;
    } else {
      const total = effFav + effDog;
      const line = ball(t.ballQ);
      mathLine = `Total ${total} vs ${line}: d=${d.d > 0 ? "+" : ""}${d.d} → ${d.kind}`;
    }

    let resultLine: string;
    const s = t.status;
    if (s === "won") {
      resultLine =
        d.kind === "full_win"
          ? `WON full stake +${mmk(t.netMmk)}`
          : `WON on-line +${mmk(t.netMmk)} (${price(t.priceC)} × ${mmk(t.stakeMmk)})`;
    } else if (s === "lost") {
      if (d.kind === "full_lose") {
        resultLine = `LOST full stake −${mmk(t.stakeMmk)}`;
      } else if (d.kind === "partial_lose") {
        resultLine = `LOST partial −${mmk(Math.abs(t.netMmk))} (${d.lossFraction} × ${mmk(t.stakeMmk)})`;
      } else {
        resultLine = `LOST on-line −${mmk(Math.abs(t.netMmk))} (${price(t.priceC)} × ${mmk(t.stakeMmk)})`;
      }
    } else if (s === "push") {
      resultLine = `PUSH 0 (stake returned)`;
    } else {
      resultLine = t.netMmk != null ? signedMmk(t.netMmk) : "";
    }

    return (
      <div className="text-xs text-gray-400 mt-1 space-y-0.5 font-mono">
        <div>{scoreLine}</div>
        <div>{mathLine}</div>
        <div className={t.netMmk >= 0 ? "text-green-600" : "text-red-500"}>
          {resultLine}
        </div>
      </div>
    );
  } catch {
    return null;
  }
}

export default function BetsPage() {
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [data, setData] = useState<BetsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  function buildUrl() {
    const params = new URLSearchParams();
    if (status !== "all") params.set("status", status);
    if (q.trim()) params.set("q", q.trim());
    return `/api/admin/bets${params.toString() ? `?${params}` : ""}`;
  }

  function reload() {
    setLoading(true);
    setError("");
    api<BetsResponse>(buildUrl())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Failed to load");
        setLoading(false);
      });
  }

  useEffect(() => {
    reload();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, q]);

  async function voidTicket(ticketNo: string) {
    const ok = window.confirm(`Void ticket ${ticketNo}?`);
    if (!ok) return;
    const reason = window.prompt("Void reason (required):") ?? "";
    if (!reason.trim()) return;
    const key = `void-${ticketNo}`;
    setBusy((prev) => ({ ...prev, [key]: true }));
    setError("");
    try {
      await api("/api/admin/settle", { action: "void", ticketNo, reason });
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
    } finally {
      setBusy((prev) => ({ ...prev, [key]: false }));
    }
  }

  function toggleExpand(ticketNo: string) {
    setExpanded((prev) => ({ ...prev, [ticketNo]: !prev[ticketNo] }));
  }

  return (
    <main>
      <h1 className="mb-3 text-lg font-bold">Bets</h1>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 items-center mb-4">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="border rounded px-2 py-1 text-sm"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Search ticket / player / team…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="border rounded px-2 py-1 text-sm flex-1 min-w-0"
        />
      </div>

      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
      {loading && <p className="text-gray-500">Loading…</p>}

      {!loading && data && (
        <>
          {data.note && (
            <p className="text-yellow-700 text-xs mb-2 bg-yellow-50 border border-yellow-200 rounded px-2 py-1">
              {data.note}
            </p>
          )}
          {data.rows.length === 0 && (
            <p className="text-gray-500 text-sm">No bets found.</p>
          )}
          <div className="space-y-2">
            {data.rows.map((t) => {
              const isExpanded = expanded[t.ticketNo] ?? false;
              const label = pickLabel(
                { favSide: t.favSide, ballQ: t.ballQ, priceC: t.priceC, market: t.market },
                { homeTeam: t.homeTeam, awayTeam: t.awayTeam },
                t.side,
              );
              const voidKey = `void-${t.ticketNo}`;
              const canVoid = t.status !== "void" && t.settlementId == null;
              const voidDisabledReason = t.status === "void"
                ? "voided"
                : t.settlementId != null
                  ? "settled"
                  : null;

              return (
                <div key={t.ticketNo} className="rounded border">
                  {/* Row header */}
                  <div
                    className="flex items-center justify-between p-3 cursor-pointer gap-2"
                    onClick={() => toggleExpand(t.ticketNo)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-display text-xs text-gray-500 font-mono">
                          {t.ticketNo}
                        </span>
                        <span className="font-semibold text-sm">{t.playerName}</span>
                        {statusBadge(t.status)}
                      </div>
                      <div className="text-sm mt-0.5">{label}</div>
                      <div className="text-xs text-gray-500">
                        Stake: {mmk(t.stakeMmk)} MMK
                        {t.netMmk != null && (
                          <span
                            className={
                              t.netMmk >= 0
                                ? " text-green-700 font-semibold"
                                : " text-red-600 font-semibold"
                            }
                          >
                            {" "}· Net: {signedMmk(t.netMmk)}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-gray-400 text-sm shrink-0">
                      {isExpanded ? "▲" : "▼"}
                    </span>
                  </div>

                  {/* Expanded breakdown */}
                  {isExpanded && (
                    <div className="border-t px-3 pb-3 pt-2">
                      <div className="text-xs text-gray-500 mb-2">
                        {t.homeTeam} vs {t.awayTeam} · {t.stage} · {t.matchStatus}
                      </div>
                      <GradeBreakdown t={t} />
                      <div className="mt-3">
                        <button
                          disabled={busy[voidKey] || !canVoid}
                          onClick={() => voidTicket(t.ticketNo)}
                          title={voidDisabledReason ?? undefined}
                          className="border border-red-300 text-red-600 text-xs px-2 py-0.5 rounded disabled:opacity-40"
                        >
                          {voidDisabledReason ? `Void (${voidDisabledReason})` : "Void"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 4.2: TypeScript check**

```bash
cd /mnt/hermes-data/mmzphyo/Projects/WorldBet2026 && npx tsc --noEmit 2>&1 | head -30
```

Expected: No errors.

- [ ] **Step 4.3: Commit**

```bash
cd /mnt/hermes-data/mmzphyo/Projects/WorldBet2026 && git add src/app/admin/bets/page.tsx && git commit -m "feat: admin /bets page with filter bar, gradeDetail breakdown, and void action"
```

---

### Task 5: /admin/audit page

**Files:**

- Create: `src/app/admin/audit/page.tsx`

- [ ] **Step 5.1: Create the page**

Create `src/app/admin/audit/page.tsx`:

```typescript
"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";

type AuditRow = {
  id: number;
  at: string;
  action: string;
  subject: string;
  detail: string | null;
  actorId: number;
  actorName: string;
};

function formatMmt(isoString: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Yangon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(isoString));
}

const ACTION_COLORS: Record<string, string> = {
  void: "bg-red-50 text-red-700",
  pin_reset: "bg-yellow-50 text-yellow-700",
  score_correction: "bg-blue-50 text-blue-700",
  final_score: "bg-blue-50 text-blue-700",
  limit_change: "bg-purple-50 text-purple-700",
  unlock: "bg-green-50 text-green-700",
  grant_admin: "bg-orange-50 text-orange-700",
};

export default function AuditPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api<AuditRow[]>("/api/admin/audit")
      .then((data) => {
        setRows(data);
        setLoading(false);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Failed to load");
        setLoading(false);
      });
  }, []);

  return (
    <main>
      <h1 className="mb-1 text-lg font-bold">Audit Log</h1>
      <p className="text-xs text-gray-500 mb-3 leading-relaxed">
        Last 200 entries, newest first. Registration-block attempts are in the
        server log (
        <code className="font-mono">journalctl -u worldbet | grep register-blocked</code>
        ), not here.
      </p>

      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
      {loading && <p className="text-gray-500">Loading…</p>}

      {!loading && rows.length === 0 && (
        <p className="text-gray-500 text-sm">No audit entries yet.</p>
      )}

      {!loading && rows.length > 0 && (
        <div className="space-y-1">
          {rows.map((row) => {
            const actionStyle =
              ACTION_COLORS[row.action] ?? "bg-gray-50 text-gray-600";
            return (
              <div
                key={row.id}
                className="rounded border px-3 py-2 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-gray-400 shrink-0">
                    {formatMmt(row.at)}
                  </span>
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded font-semibold shrink-0 ${actionStyle}`}
                  >
                    {row.action}
                  </span>
                  <span className="font-semibold shrink-0">{row.actorName}</span>
                  <span className="text-gray-500 font-mono text-xs">
                    {row.subject}
                  </span>
                </div>
                {row.detail && (
                  <div className="text-xs text-gray-500 mt-0.5 pl-0">
                    {row.detail}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 5.2: TypeScript check**

```bash
cd /mnt/hermes-data/mmzphyo/Projects/WorldBet2026 && npx tsc --noEmit 2>&1 | head -30
```

Expected: No errors.

- [ ] **Step 5.3: Commit**

```bash
cd /mnt/hermes-data/mmzphyo/Projects/WorldBet2026 && git add src/app/admin/audit/page.tsx && git commit -m "feat: admin /audit page — read-only audit log"
```

---

### Task 6: Verify audit trail + full gate

**Files:** (no new files — verification only)

- [ ] **Step 6.1: Verify voidTicket writes audit_log**

Check `src/lib/accounting/settle.ts` lines 116–124:

```
tx.insert(schema.auditLog)
  .values({
    actorId: adminId,
    action: "void",
    subject: `ticket:${ticketNo}`,
    detail: reason,
    at,
  })
  .run();
```

This is already present. The existing test in `settle.test.ts` at line 126–128 confirms it:

```typescript
expect(
  db
    .select()
    .from(schema.auditLog)
    .all()
    .some((a) => a.action === "void"),
).toBe(true);
```

No code change needed — the audit trail is confirmed working.

- [ ] **Step 6.2: Run full test suite**

```bash
cd /mnt/hermes-data/mmzphyo/Projects/WorldBet2026 && npx vitest run 2>&1 | tail -30
```

Expected: All tests pass (0 failures).

- [ ] **Step 6.3: Run TypeScript check**

```bash
cd /mnt/hermes-data/mmzphyo/Projects/WorldBet2026 && npx tsc --noEmit 2>&1
```

Expected: No output (clean).

- [ ] **Step 6.4: Run lint**

```bash
cd /mnt/hermes-data/mmzphyo/Projects/WorldBet2026 && npm run lint 2>&1 | tail -20
```

Expected: 0 errors.

- [ ] **Step 6.5: Run build**

```bash
cd /mnt/hermes-data/mmzphyo/Projects/WorldBet2026 && npm run build 2>&1 | tail -30
```

Expected: Build succeeds. Verify `/admin/bets` and `/admin/audit` appear in the route list.

- [ ] **Step 6.6: Final commit**

```bash
cd /mnt/hermes-data/mmzphyo/Projects/WorldBet2026 && git add -A && git commit -m "feat: admin bet-management page + audit-log view (audited void reused)"
```

---

## Self-Review

**Spec coverage:**

| Requirement                                                       | Task                               |
| ----------------------------------------------------------------- | ---------------------------------- |
| GET /api/admin/bets with status + q filters                       | Task 1                             |
| GET /api/admin/audit last 200 rows                                | Task 2                             |
| /admin/bets filter bar, expandable rows, grade breakdown          | Task 4                             |
| /admin/bets void action → POST existing /api/admin/settle         | Task 4                             |
| /admin/audit read-only table, MMT time, server-log note           | Task 5                             |
| Admin nav Bets + Audit links                                      | Task 3                             |
| voidTicket audit trail verified                                   | Task 6 Step 6.1                    |
| tsc clean, lint 0 errors, vitest green, build succeeds            | Task 6 Steps 6.2–6.5               |
| `finalHome`/`finalAway` (matches.homeScore/awayScore) in bets API | Task 1 Step 1.3                    |
| voidedBy resolves to display_name                                 | Task 1 (voiderMap)                 |
| actorName 'system' when actorId === 0 or not found                | Task 2                             |
| Disable void for settled/voided + reason shown                    | Task 4 (voidDisabledReason)        |
| pending/ungraded → "not yet graded"                               | Task 4 (GradeBreakdown component)  |
| cap at 500 with note in response                                  | Task 1 (CAP constant + note field) |

**Placeholder scan:** No TBDs or "implement later" phrases found.

**Type consistency:**

- `BetRow` type defined in `route.ts` and redeclared inline in `page.tsx` (client-side type, acceptable — no shared import needed between server route and client component)
- `GradeInput` imported from `@/lib/engine/grade` in both settle page (existing) and bets page (new) — same shape
- `getAllBets` / `getAuditLog` exported for testing, imported correctly in test files
- `voidedById` stripped from rows before returning (mapped to `voidedBy: string | null`)
