# Match Detail Page (Wikipedia team data) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/match/[matchId]` player detail page (reached by tapping a match card) showing local match facts plus each team's Wikipedia summary, key facts, and best-effort recent form, served from a server-side `team_wiki` DB cache.

**Architecture:** A new `src/lib/wiki/teams.ts` isolates all Wikipedia network + parsing. A `team_wiki` table (migration 0006) caches per-team data, populated by a `db:fetch-teams` script. `GET /api/matches/[matchId]` is extended to return the cached team data; the page and card read only our DB. Pure parsers are TDD'd; network code is exercised by the script, not tests.

**Tech Stack:** Next.js 16 App Router, TypeScript, Drizzle/Postgres, Tailwind v4, vitest, tsx scripts, drizzle-kit migrations. Bilingual EN/MM (parity test).

---

## File Structure

- `src/lib/wiki/teams.ts` — **create**: `WIKI_TITLE_OVERRIDE`, `wikiTitle()`, pure `parseInfobox()` / `parseRecentResults()`, network `fetchTeamSummary()` / `fetchTeamInfobox()`, composer `buildTeamWiki()`.
- `src/lib/wiki/teams.test.ts` — **create**: unit tests for the pure functions.
- `src/lib/db/schema.ts` — **modify**: add `teamWiki` table.
- `drizzle/0006_*.sql` — **generate**: the migration.
- `scripts/fetch-team-wiki.ts` — **create**: populate/refresh the cache.
- `package.json` — **modify**: add `db:fetch-teams` script.
- `src/app/api/matches/[matchId]/route.ts` — **modify**: return `teamWiki`.
- `src/lib/i18n/en.ts` + `src/lib/i18n/mm.ts` — **modify**: new keys.
- `src/app/(player)/match/[matchId]/page.tsx` — **create**: the detail page.
- `src/components/MatchCard.tsx` — **modify**: wrap rows 1–5 in a `<Link>` to `/match/[id]`.

---

## Task 1: `wiki/teams.ts` title map + pure parsers (TDD)

**Files:**

- Create: `src/lib/wiki/teams.ts`
- Create: `src/lib/wiki/teams.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/wiki/teams.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { wikiTitle, parseInfobox, parseRecentResults } from "./teams";

describe("wikiTitle", () => {
  it("uses the default '<name> national football team' for normal codes", () => {
    expect(wikiTitle("ESP")).toBe("Spain national football team");
    expect(wikiTitle("BRA")).toBe("Brazil national football team");
  });
  it("uses curated overrides for the exceptions", () => {
    expect(wikiTitle("USA")).toBe("United States men's national soccer team");
    expect(wikiTitle("CZE")).toBe("Czech Republic national football team");
    expect(wikiTitle("TUR")).toBe("Turkey national football team");
    expect(wikiTitle("CIV")).toBe("Ivory Coast national football team");
    expect(wikiTitle("BIH")).toBe(
      "Bosnia and Herzegovina national football team",
    );
  });
  it("returns null for unknown/placeholder codes", () => {
    expect(wikiTitle("W73")).toBeNull();
    expect(wikiTitle("XYZ")).toBeNull();
  });
});

describe("parseInfobox", () => {
  const infobox = `{{Infobox national football team
| Name = Spain
| FIFA Rank = 8
| Confederation = [[UEFA]] (Europe)
| Coach = {{flagicon|ESP}} [[Luis de la Fuente]]
| Nickname = ''La Roja'' (The Red One)
}}`;
  it("extracts rank, confederation, coach, nickname with markup stripped", () => {
    expect(parseInfobox(infobox)).toEqual({
      fifaRank: 8,
      confederation: "UEFA",
      coach: "Luis de la Fuente",
      nickname: "La Roja",
    });
  });
  it("returns nulls for fields not present", () => {
    expect(parseInfobox("no infobox here")).toEqual({
      fifaRank: null,
      confederation: null,
      coach: null,
      nickname: null,
    });
  });
});

describe("parseRecentResults", () => {
  const wikitext = `
{{Football box collapsible
|date=2026-03-23
|team1=Spain
|score=2–1
|team2=Portugal
}}
{{Football box collapsible
|date=2026-03-26
|team1=Germany
|score=0–0
|team2=Spain
}}`;
  it("parses up to 5 recent result rows", () => {
    const rows = parseRecentResults(wikitext);
    expect(rows.length).toBe(2);
    expect(rows[0]).toEqual({
      date: "2026-03-23",
      team1: "Spain",
      team2: "Portugal",
      score: "2–1",
    });
  });
  it("returns [] when nothing parses", () => {
    expect(parseRecentResults("garbage")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/wiki/teams.test.ts`
Expected: FAIL — module `./teams` not found / exports missing.

- [ ] **Step 3: Write the implementation (pure parts)**

Create `src/lib/wiki/teams.ts`:

```ts
// All Wikipedia network access + fragile parsing is isolated here. The match
// detail page and API read only the cached team_wiki rows this produces; this
// module is invoked only by scripts/fetch-team-wiki.ts. Mirrors the proven
// `?action=raw` pattern in src/lib/scores/wikipedia.ts.
import { teamName, isFifaCode } from "@/lib/client/flags";

// Article titles that don't follow "<name> national football team" (Wikipedia's
// own spelling/format: Czech Republic, men's soccer for US/Canada/Australia,
// Turkey, Ivory Coast, "and" in Bosnia).
const WIKI_TITLE_OVERRIDE: Record<string, string> = {
  USA: "United States men's national soccer team",
  CAN: "Canada men's national soccer team",
  AUS: "Australia men's national soccer team",
  CZE: "Czech Republic national football team",
  TUR: "Turkey national football team",
  CIV: "Ivory Coast national football team",
  BIH: "Bosnia and Herzegovina national football team",
};

/** Exact Wikipedia article title for a FIFA code, or null for placeholders. */
export function wikiTitle(code: string): string | null {
  if (WIKI_TITLE_OVERRIDE[code]) return WIKI_TITLE_OVERRIDE[code];
  if (!isFifaCode(code)) return null;
  return `${teamName(code)} national football team`;
}

/** Strip common wiki markup from a field value: [[link|text]]→text, {{...}}
 *  templates removed, '' italics removed, trailing parenthetical removed. */
function clean(s: string): string {
  return s
    .replace(/\{\{[^{}]*\}\}/g, "") // drop templates like {{flagicon|ESP}}
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1") // [[A|B]]→B, [[A]]→A
    .replace(/'''?/g, "") // bold/italic apostrophes
    .replace(/\([^)]*\)/g, "") // trailing "(Europe)" / "(The Red One)"
    .replace(/<[^>]+>/g, "") // stray HTML tags
    .trim();
}

function field(wikitext: string, name: string): string | null {
  // Matches "| FIFA Rank = value" up to the next "|" at line start or "}}".
  const re = new RegExp(`\\|\\s*${name}\\s*=\\s*([^\\n|}]+)`, "i");
  const m = wikitext.match(re);
  if (!m) return null;
  const v = clean(m[1]);
  return v.length ? v : null;
}

export type TeamFacts = {
  fifaRank: number | null;
  confederation: string | null;
  coach: string | null;
  nickname: string | null;
};

/** Best-effort parse of {{Infobox national football team}} key facts. Every
 *  field is independently nullable. */
export function parseInfobox(wikitext: string): TeamFacts {
  const rankRaw = field(wikitext, "FIFA Rank");
  const rank = rankRaw && /^\d+$/.test(rankRaw) ? Number(rankRaw) : null;
  return {
    fifaRank: rank,
    confederation: field(wikitext, "Confederation"),
    coach: field(wikitext, "Coach") ?? field(wikitext, "Manager"),
    nickname: field(wikitext, "Nickname"),
  };
}

export type ResultRow = {
  date: string;
  team1: string;
  team2: string;
  score: string;
};

/** Best-effort parse of recent results from {{Football box collapsible}} blocks.
 *  Returns up to 5 most-recent-looking rows, or [] when nothing parses. */
export function parseRecentResults(wikitext: string): ResultRow[] {
  const rows: ResultRow[] = [];
  for (const part of wikitext.split(/\{\{Football box collapsible/i).slice(1)) {
    const date = part.match(/\|\s*date\s*=\s*([^\n|}]+)/i);
    const t1 = part.match(/\|\s*team1\s*=\s*([^\n|}]+)/i);
    const t2 = part.match(/\|\s*team2\s*=\s*([^\n|}]+)/i);
    const sc = part.match(/\|\s*score\s*=\s*(\d{1,2}\s*[-‒–—―−]\s*\d{1,2})/i);
    if (date && t1 && t2 && sc)
      rows.push({
        date: date[1].trim(),
        team1: clean(t1[1]),
        team2: clean(t2[1]),
        score: sc[1].replace(/\s/g, ""),
      });
    if (rows.length >= 5) break;
  }
  return rows;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/wiki/teams.test.ts`
Expected: PASS (all `wikiTitle`, `parseInfobox`, `parseRecentResults` cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/wiki/teams.ts src/lib/wiki/teams.test.ts
git commit -m "feat: wiki/teams title map + infobox/results parsers"
```

---

## Task 2: `team_wiki` table + migration 0006

**Files:**

- Modify: `src/lib/db/schema.ts`
- Generate: `drizzle/0006_*.sql`

- [ ] **Step 1: Add the table to the schema**

At the END of `src/lib/db/schema.ts` (after the `auditLog` table), add:

```ts
export const teamWiki = pgTable("team_wiki", {
  code: text("code").primaryKey(), // FIFA 3-letter code, e.g. "ESP"
  title: text("title").notNull(), // Wikipedia article title used
  extract: text("extract"), // intro summary paragraph
  thumbnailUrl: text("thumbnail_url"), // crest/lead image
  articleUrl: text("article_url"), // canonical desktop URL
  fifaRank: integer("fifa_rank"),
  confederation: text("confederation"),
  coach: text("coach"),
  nickname: text("nickname"),
  recentResults: text("recent_results"), // JSON array of {date,team1,team2,score}
  fetchedAt: text("fetched_at").notNull(),
});
```

(`pgTable`, `text`, `integer` are already imported at the top of the file.)

- [ ] **Step 2: Generate the migration**

Run: `npx drizzle-kit generate`
Expected: a new file `drizzle/0006_<name>.sql` is created containing `CREATE TABLE "team_wiki" (...)`. Verify: `ls drizzle/0006_*.sql` shows the file, and `grep -c "team_wiki" drizzle/0006_*.sql` is ≥ 1.

- [ ] **Step 3: Apply the migration to the dev DB**

Run: `npm run db:migrate`
Expected: migration `0006` applies with no error (reads `DATABASE_URL` from `.env.local`).

Verify: `psql "$(grep '^DATABASE_URL=' .env.local | cut -d= -f2-)" -c "\d team_wiki"` lists the columns.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/schema.ts drizzle/0006_*.sql drizzle/meta
git commit -m "feat: team_wiki cache table (migration 0006)"
```

---

## Task 3: Wikipedia network functions + `buildTeamWiki`

No unit test (external network). Verified later by the fetch script (Task 9).

**Files:**

- Modify: `src/lib/wiki/teams.ts`

- [ ] **Step 1: Append the network functions**

At the end of `src/lib/wiki/teams.ts`, add:

```ts
const UA = "WorldBet2026/1.0 (match detail)";

export type TeamSummary = {
  extract: string | null;
  thumbnailUrl: string | null;
  articleUrl: string | null;
};

/** Wikipedia REST summary (clean JSON, follows redirects). */
export async function fetchTeamSummary(title: string): Promise<TeamSummary> {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
    title,
  )}`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`wiki summary ${title}: HTTP ${res.status}`);
  const j = (await res.json()) as {
    extract?: string;
    thumbnail?: { source?: string };
    content_urls?: { desktop?: { page?: string } };
  };
  return {
    extract: j.extract ?? null,
    thumbnailUrl: j.thumbnail?.source ?? null,
    articleUrl: j.content_urls?.desktop?.page ?? null,
  };
}

/** Raw article wikitext for infobox + recent-results parsing. */
export async function fetchTeamWikitext(title: string): Promise<string> {
  const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(
    title,
  )}?action=raw`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`wiki raw ${title}: HTTP ${res.status}`);
  return res.text();
}

export type TeamWikiRow = {
  code: string;
  title: string;
  extract: string | null;
  thumbnailUrl: string | null;
  articleUrl: string | null;
  fifaRank: number | null;
  confederation: string | null;
  coach: string | null;
  nickname: string | null;
  recentResults: string | null; // JSON string
  fetchedAt: string;
};

/** Compose a cache row for a code: summary + infobox facts + recent results.
 *  Network failures for the wikitext fall back to nulls/[]; the summary failing
 *  throws (caller in the script catches and reports). */
export async function buildTeamWiki(
  code: string,
  nowIso: string,
): Promise<TeamWikiRow | null> {
  const title = wikiTitle(code);
  if (!title) return null;
  const summary = await fetchTeamSummary(title);
  let facts: TeamFacts = {
    fifaRank: null,
    confederation: null,
    coach: null,
    nickname: null,
  };
  let results: ResultRow[] = [];
  try {
    const wikitext = await fetchTeamWikitext(title);
    facts = parseInfobox(wikitext);
    results = parseRecentResults(wikitext);
  } catch {
    // keep summary; facts/results stay empty (best-effort)
  }
  return {
    code,
    title,
    extract: summary.extract,
    thumbnailUrl: summary.thumbnailUrl,
    articleUrl: summary.articleUrl,
    ...facts,
    recentResults: JSON.stringify(results),
    fetchedAt: nowIso,
  };
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep -E "wiki/teams" || echo "no errors in wiki/teams"`
Expected: `no errors in wiki/teams`. (Ignore the pre-existing `practice.test.ts` error.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/wiki/teams.ts
git commit -m "feat: wiki/teams network fetch + buildTeamWiki composer"
```

---

## Task 4: `db:fetch-teams` populate script

**Files:**

- Create: `scripts/fetch-team-wiki.ts`
- Modify: `package.json`

- [ ] **Step 1: Create the script**

Create `scripts/fetch-team-wiki.ts`:

```ts
// Populate/refresh the team_wiki cache from Wikipedia for all 48 finalists.
// Idempotent (upsert on code). Reports failures so bad titles can be fixed.
//   DATABASE_URL=… npm run db:fetch-teams
import { getDb, schema } from "../src/lib/db/index";
import { buildTeamWiki } from "../src/lib/wiki/teams";
import { nowIso } from "../src/lib/time";

// The 48 WC2026 finalist FIFA codes (mirrors FIFA_NAME in src/lib/client/flags.ts).
const CODES = [
  "MEX",
  "RSA",
  "KOR",
  "CZE",
  "CAN",
  "BIH",
  "QAT",
  "SUI",
  "BRA",
  "MAR",
  "HAI",
  "USA",
  "PAR",
  "AUS",
  "TUR",
  "GER",
  "CUW",
  "CIV",
  "ECU",
  "NED",
  "JPN",
  "SWE",
  "TUN",
  "BEL",
  "EGY",
  "IRN",
  "NZL",
  "ESP",
  "CPV",
  "KSA",
  "URU",
  "FRA",
  "SEN",
  "IRQ",
  "NOR",
  "ARG",
  "ALG",
  "AUT",
  "JOR",
  "POR",
  "COD",
  "UZB",
  "COL",
  "CRO",
  "GHA",
  "PAN",
  "ENG",
  "SCO",
];

async function main() {
  const db = getDb();
  let ok = 0;
  const noExtract: string[] = [];
  const failed: string[] = [];
  for (const code of CODES) {
    try {
      const row = await buildTeamWiki(code, nowIso());
      if (!row) {
        failed.push(`${code} (no title)`);
        continue;
      }
      await db
        .insert(schema.teamWiki)
        .values(row)
        .onConflictDoUpdate({ target: schema.teamWiki.code, set: row });
      ok++;
      if (!row.extract) noExtract.push(code);
    } catch (e) {
      failed.push(`${code}: ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`team_wiki: upserted ${ok}/${CODES.length}`);
  if (noExtract.length) console.log(`  no extract: ${noExtract.join(", ")}`);
  if (failed.length) console.log(`  FAILED: ${failed.join(" | ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Add the npm script**

In `package.json` `"scripts"`, next to the other `tsx` scripts, add:

```json
"db:fetch-teams": "tsx scripts/fetch-team-wiki.ts",
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep -E "fetch-team-wiki" || echo "no errors in fetch script"`
Expected: `no errors in fetch script`.

- [ ] **Step 4: Commit**

```bash
git add scripts/fetch-team-wiki.ts package.json
git commit -m "feat: db:fetch-teams script to populate team_wiki cache"
```

(The script is run against real DBs in Task 9 / at deploy — not in CI.)

---

## Task 5: Extend `GET /api/matches/[matchId]` with team data

No API test harness for this route; verified by build + the page.

**Files:**

- Modify: `src/app/api/matches/[matchId]/route.ts`

- [ ] **Step 1: Return cached team data**

In `src/app/api/matches/[matchId]/route.ts`, add an import for `inArray`:

```ts
import { eq, inArray } from "drizzle-orm";
```

Then change the final `return ok({...})` block. Currently:

```ts
if (!m) return fail("not_found", "match not found");
return ok({
  ...m,
  line: await latestLine(db, m.id, "ah"),
  ouLine: await latestLine(db, m.id, "ou"),
});
```

to:

```ts
if (!m) return fail("not_found", "match not found");
const wikiRows = await db
  .select()
  .from(schema.teamWiki)
  .where(inArray(schema.teamWiki.code, [m.homeTeam, m.awayTeam]));
const teamWiki: Record<string, unknown> = {};
for (const r of wikiRows) {
  teamWiki[r.code] = {
    ...r,
    recentResults: r.recentResults ? JSON.parse(r.recentResults) : [],
  };
}
return ok({
  ...m,
  line: await latestLine(db, m.id, "ah"),
  ouLine: await latestLine(db, m.id, "ou"),
  teamWiki, // keyed by team code; missing team → absent key
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep -E "matches/\[matchId\]" || echo "no errors in match route"`
Expected: `no errors in match route`.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/matches/[matchId]/route.ts"
git commit -m "feat: include cached team_wiki data in match detail API"
```

---

## Task 6: i18n keys

**Files:**

- Modify: `src/lib/i18n/en.ts`
- Modify: `src/lib/i18n/mm.ts`

- [ ] **Step 1: Add keys to `en.ts`**

In `src/lib/i18n/en.ts`, before the closing `} as const;`, add:

```ts
  matchDetails: "Match details",
  aboutTeam: "About",
  keyFacts: "Key facts",
  fifaRank: "FIFA ranking",
  confederation: "Confederation",
  coach: "Head coach",
  nickname: "Nickname",
  recentForm: "Recent form",
  readMoreWiki: "Read more on Wikipedia",
  infoComingSoon: "More info coming soon",
  formUnavailable: "Recent form unavailable",
```

- [ ] **Step 2: Run the parity test to verify it FAILS**

Run: `npx vitest run src/lib/i18n/i18n.test.ts`
Expected: FAIL — mm missing the 11 new keys.

- [ ] **Step 3: Add the same keys to `mm.ts`**

In `src/lib/i18n/mm.ts`, before its closing `} as const;` (or the trailing comment block — place the keys inside the object), add:

```ts
  matchDetails: "ပွဲစဉ်အသေးစိတ်",
  aboutTeam: "အကြောင်း",
  keyFacts: "အဓိကအချက်များ",
  fifaRank: "FIFA အဆင့်",
  confederation: "ကွန်ဖက်ဒရေးရှင်း",
  coach: "နည်းပြ",
  nickname: "အမည်ပြောင်",
  recentForm: "မကြာသေးမီ ဖောင်",
  readMoreWiki: "Wikipedia တွင် ဆက်ဖတ်ရန်",
  infoComingSoon: "အချက်အလက် မကြာမီ ထည့်ပါမည်",
  formUnavailable: "မကြာသေးမီ ဖောင် မရရှိနိုင်ပါ",
```

- [ ] **Step 4: Run the parity test to verify it PASSES**

Run: `npx vitest run src/lib/i18n/i18n.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/i18n/en.ts src/lib/i18n/mm.ts
git commit -m "i18n: add match-detail page labels"
```

---

## Task 7: Match detail page `/match/[matchId]`

No render-test harness; verified by build + lint + manual.

**Files:**

- Create: `src/app/(player)/match/[matchId]/page.tsx`

- [ ] **Step 1: Create the page**

Create `src/app/(player)/match/[matchId]/page.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api, redirectIfPinChange } from "@/lib/client/api";
import { useT } from "@/lib/i18n";
import { errMsg } from "@/lib/client/errMsg";
import { matchStarted, finalScore } from "@/lib/client/format";
import { teamName, flagSrc } from "@/lib/client/flags";
import type { MatchRow } from "@/components/MatchCard";

type TeamWiki = {
  code: string;
  extract: string | null;
  thumbnailUrl: string | null;
  articleUrl: string | null;
  fifaRank: number | null;
  confederation: string | null;
  coach: string | null;
  nickname: string | null;
  recentResults: {
    date: string;
    team1: string;
    team2: string;
    score: string;
  }[];
};
type MatchDetail = MatchRow & {
  venue: string;
  teamWiki: Record<string, TeamWiki | undefined>;
};

function Kickoff({ iso }: { iso: string }) {
  const s = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Yangon",
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
  return <>{s}</>;
}

function TeamCircle({ code, src }: { code: string; src: string | null }) {
  return (
    <span className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-surface-2 ring-1 ring-border">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={code} className="h-full w-full object-cover" />
      ) : (
        <span className="text-xs font-bold text-faint">{code}</span>
      )}
    </span>
  );
}

function Fact({
  label,
  value,
}: {
  label: string;
  value: string | number | null;
}) {
  if (value == null || value === "") return null;
  return (
    <div className="flex justify-between gap-3 border-b border-border py-1.5 text-sm last:border-0">
      <span className="text-faint">{label}</span>
      <span className="text-right font-semibold text-ink">{value}</span>
    </div>
  );
}

function TeamSection({ code, w }: { code: string; w?: TeamWiki }) {
  const { t } = useT();
  return (
    <section className="mb-4 rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center gap-3">
        <TeamCircle code={code} src={w?.thumbnailUrl ?? flagSrc(code)} />
        <h2 className="text-lg font-bold text-ink">{teamName(code)}</h2>
      </div>
      {w?.extract ? (
        <p className="text-sm leading-relaxed text-muted">{w.extract}</p>
      ) : (
        <p className="text-sm text-faint">{t.infoComingSoon}</p>
      )}
      {w && (w.fifaRank || w.confederation || w.coach || w.nickname) && (
        <div className="mt-3">
          <h3 className="mb-1 text-xs font-bold uppercase tracking-wider text-faint">
            {t.keyFacts}
          </h3>
          <Fact label={t.fifaRank} value={w.fifaRank} />
          <Fact label={t.confederation} value={w.confederation} />
          <Fact label={t.coach} value={w.coach} />
          <Fact label={t.nickname} value={w.nickname} />
        </div>
      )}
      {w?.recentResults && w.recentResults.length > 0 && (
        <div className="mt-3">
          <h3 className="mb-1 text-xs font-bold uppercase tracking-wider text-faint">
            {t.recentForm}
          </h3>
          {w.recentResults.map((r, i) => (
            <div
              key={i}
              className="flex justify-between py-1 text-sm text-muted"
            >
              <span className="truncate">
                {r.team1} {r.score} {r.team2}
              </span>
              <span className="ml-2 shrink-0 text-faint">{r.date}</span>
            </div>
          ))}
        </div>
      )}
      {w?.articleUrl && (
        <a
          href={w.articleUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block text-sm font-semibold text-us-neon focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
        >
          {t.readMoreWiki} ↗
        </a>
      )}
    </section>
  );
}

export default function MatchDetailPage() {
  const { t } = useT();
  const params = useParams<{ matchId: string }>();
  const matchId = Number(params.matchId);
  const [m, setM] = useState<MatchDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<MatchDetail>(`/api/matches/${matchId}`)
      .then(setM)
      .catch((e) => {
        if (!redirectIfPinChange(e)) setError(errMsg(t, e));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  if (error)
    return (
      <main className="p-3">
        <p className="mt-8 text-center text-ca">{error}</p>
      </main>
    );
  if (!m)
    return (
      <main className="p-3">
        <p className="mt-8 text-center text-faint">…</p>
      </main>
    );

  const ft = finalScore(m.status, m.homeScore, m.awayScore);
  const canBet = !matchStarted(m) && !!m.line;

  return (
    <main className="p-3">
      <Link
        href="/"
        className="mb-3 inline-block text-sm text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
      >
        ← {t.backToMatches}
      </Link>

      {/* Header: local match facts */}
      <div className="mb-4 rounded-xl border border-border bg-surface p-4 text-center">
        <p className="text-xs font-semibold uppercase tracking-wider text-faint">
          {m.stage}
        </p>
        <h1 className="mt-1 text-xl font-bold text-ink">
          {teamName(m.homeTeam)} vs {teamName(m.awayTeam)}
        </h1>
        {ft && <p className="font-display mt-1 text-3xl text-ink">{ft}</p>}
        <p className="mt-1 text-sm text-muted">
          <Kickoff iso={m.kickoffUtc} />
        </p>
        <p className="text-sm text-faint">{m.venue}</p>
      </div>

      <TeamSection code={m.homeTeam} w={m.teamWiki[m.homeTeam]} />
      <TeamSection code={m.awayTeam} w={m.teamWiki[m.awayTeam]} />

      {canBet && (
        <Link
          href={`/bet/${m.id}`}
          className="block rounded-xl border-2 border-mx bg-mx/10 py-3 text-center text-base font-bold text-mx-neon focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
        >
          {t.betPageTitle}
        </Link>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Type-check + lint**

Run: `npx tsc --noEmit 2>&1 | grep -E "match/\[matchId\]" || echo "no errors in detail page"`
then `npm run lint 2>&1 | grep -E "match/\[matchId\]" || echo "lint clean for detail page"`
Expected: `no errors in detail page` and `lint clean for detail page`. (Ignore pre-existing `practice.test.ts` error.)

- [ ] **Step 3: Commit**

```bash
git add "src/app/(player)/match/[matchId]/page.tsx"
git commit -m "feat: /match/[matchId] detail page with Wikipedia team data"
```

---

## Task 8: Make the card body open the detail page

**Files:**

- Modify: `src/components/MatchCard.tsx`

- [ ] **Step 1: Import `Link`**

At the top of `src/components/MatchCard.tsx`, add after the `useState` import line:

```ts
import Link from "next/link";
```

- [ ] **Step 2: Wrap rows 1–5 in a Link to the detail page**

In the `MatchCard` return, the card currently renders (in order) Row 1 (status + stage), Rows 2–4 (the `flex items-start gap-2` block), Row 5 (the schedule `<p>`), then Row 6 (`<div className="mt-2">{renderAction()}</div>`).

Wrap **Row 1 through Row 5** (everything before the Row-6 `<div className="mt-2">…`) in a `Link`. Concretely, change:

```tsx
    <div className="mb-2 rounded-xl border border-border bg-surface p-4 shadow-sm">
      {/* Row 1 — status + stage */}
      <div className="mb-3 flex items-center justify-between">
```

to:

```tsx
    <div className="mb-2 rounded-xl border border-border bg-surface p-4 shadow-sm">
      <Link
        href={`/match/${m.id}`}
        className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
      >
        {/* Row 1 — status + stage */}
        <div className="mb-3 flex items-center justify-between">
```

Then find the end of Row 5 (the schedule paragraph):

```tsx
{
  /* Row 5 — schedule */
}
<p className="mt-3 text-center text-sm text-muted">{schedule}</p>;

{
  /* Row 6 — action area */
}
<div className="mt-2">{renderAction()}</div>;
```

and change it to close the `Link` after Row 5, keeping Row 6 OUTSIDE the link:

```tsx
        {/* Row 5 — schedule */}
        <p className="mt-3 text-center text-sm text-muted">{schedule}</p>
      </Link>

      {/* Row 6 — action area */}
      <div className="mt-2">{renderAction()}</div>
```

(Result: tapping the status/teams/flags/score/schedule region navigates to `/match/[id]`; the bet tiles in Row 6 still call `onPick` → `/bet`. The intervening Rows 2–4 markup is unchanged — only the wrapping `Link` open tag before Row 1 and the closing `</Link>` after Row 5 are added.)

- [ ] **Step 3: Type-check + lint**

Run: `npx tsc --noEmit 2>&1 | grep -E "MatchCard" || echo "no errors in MatchCard"`
then `npm run lint 2>&1 | grep -E "MatchCard" || echo "lint clean for MatchCard"`
Expected: `no errors in MatchCard` and `lint clean for MatchCard`.

- [ ] **Step 4: Commit**

```bash
git add src/components/MatchCard.tsx
git commit -m "feat: tapping the match card body opens the detail page"
```

---

## Task 9: Full verification + populate cache

**Files:** none (gate + data).

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: PASS — includes `wiki/teams.test.ts` and i18n parity (with the 11 new keys). All prior tests green.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: 0 errors (pre-existing warnings fine).

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: build succeeds; `/match/[matchId]` and `/` compile.

- [ ] **Step 4: Populate the dev cache and spot-check**

Run: `npm run db:fetch-teams`
Expected: `team_wiki: upserted 48/48` (a few `no extract` are tolerable; investigate any `FAILED` titles and fix `WIKI_TITLE_OVERRIDE` in `src/lib/wiki/teams.ts` if a team failed, then re-run). Spot-check:
`psql "$(grep '^DATABASE_URL=' .env.local | cut -d= -f2-)" -c "select code, fifa_rank, left(extract,40) from team_wiki where code in ('ESP','USA','BRA');"`
Expected: rows with non-null extracts.

- [ ] **Step 5: Manual eyeball (dev server)**

Run `npm run dev`, log in as a player:

- On the board, tapping a match card's body opens `/match/[id]`; the bet tiles still open `/bet`.
- The detail page shows the match header (stage/teams/venue/kickoff, FT score if finished), two team sections with Wikipedia extract + key facts + "Read more on Wikipedia" link, and recent form when present (or the graceful "More info coming soon" for a team missing from cache).

Expected: all hold. **Deploy note:** this change has a migration — at deploy run `npm run db:migrate` against **both** `worldbet` and `worldbet_staging`, then `npm run db:fetch-teams` against each (export each `DATABASE_URL`).

- [ ] **Step 6: No commit** (verification only). Fix-and-rerun if a step fails.

---

## Notes for the implementer

- **All Wikipedia access is isolated** in `src/lib/wiki/teams.ts` + the fetch script. The page/API read only cached `team_wiki` rows, so the PWA stays offline-safe. Never call Wikipedia from the page or request path.
- **Everything Wikipedia-derived is nullable** — partial data is normal; the UI omits empty facts and shows graceful fallbacks. Don't add "required" assumptions.
- **Migration discipline:** `npx drizzle-kit generate` creates `0006`; it must run via `db:migrate` on BOTH prod and staging DBs at deploy (see CLAUDE.md deploy topology), followed by `db:fetch-teams` on each.
- **Best-effort parsers:** `parseInfobox`/`parseRecentResults` are deliberately tolerant; if a real article doesn't match, fields come back null/[] rather than throwing. The fetch script's report surfaces teams needing attention.
- **No money/grading/bet-flow change.** The only schema change is the additive `team_wiki` table.

```

```
