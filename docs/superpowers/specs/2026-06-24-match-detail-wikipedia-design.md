# Match Detail Page (Wikipedia team data) — Design

> **Status:** Approved 2026-06-24 (Cycle 2 of the board request; Cycle 1 = By Day date
> filter, shipped). Ready for implementation planning.
> **Scope:** A new player `/match/[matchId]` detail page reached by tapping a match
> card. It shows local match facts plus, for each team, Wikipedia data (intro summary +
> key facts) served from a server-side DB cache, plus a best-effort head-to-head.
> Adds a DB table + migration `0006`. No grading/money/bet-flow change.

## Goal

Tapping a match card currently does nothing on the card body (only the bet tiles
navigate, to `/bet`). Add an informational **match detail** page so a player can read
about the two teams before betting: who they are (Wikipedia intro + crest), key facts
(FIFA ranking, confederation, coach, nickname), the match's own facts (stage, venue,
kickoff, score), and a best-effort recent head-to-head/form. The app is an offline PWA,
so all Wikipedia data is fetched server-side, cached in our DB, and served by our API —
the page itself never calls Wikipedia.

## Decisions (from brainstorming)

- **Content:** team Wikipedia summary + team key facts + local match facts + best-effort
  head-to-head/form (all four selected).
- **Caching:** server-side **DB cache** in a new `team_wiki` table; pages read our DB.
- **Navigation:** tapping the **card body** (status/teams/flags/score/schedule rows)
  opens `/match/[matchId]`; the row-6 **bet tiles still navigate to `/bet`**.
- **Migration:** yes — add `drizzle/0006_team_wiki.sql`; run `db:migrate` on both
  `worldbet` (prod) and `worldbet_staging` at deploy.
- **Head-to-head:** best-effort parse (accepted it may be empty/incomplete).

## Architecture overview

```
 board card tap ──▶ /match/[matchId] (player page, server data via API)
                          │
                          ▼
        GET /api/matches/[matchId]  (extended)
          ├─ match row (local: stage, venue, kickoff, score, status)
          ├─ latest AH + OU lines (already returned)
          └─ teamWiki[home], teamWiki[away]  ◀── read from team_wiki cache table
                          ▲
                          │ populated by
        scripts/fetch-team-wiki.ts  (npm run db:fetch-teams)
          └─ src/lib/wiki/teams.ts
               ├─ fetchTeamSummary(code)  → Wikipedia REST summary API (extract+thumb)
               ├─ fetchTeamInfobox(code)  → ?action=raw wikitext → parse key facts
               └─ parseRecentResults(code)→ best-effort form rows (may be empty)
```

The Wikipedia network access lives **only** in `src/lib/wiki/teams.ts` and the fetch
script. The page and request path read cached rows. This keeps the PWA offline-safe and
isolates the fragile parsing/network behind one module.

## Data model — new `team_wiki` table (migration 0006)

In `src/lib/db/schema.ts`, add:

```ts
export const teamWiki = pgTable("team_wiki", {
  code: text("code").primaryKey(), // FIFA 3-letter code, e.g. "ESP"
  title: text("title").notNull(), // Wikipedia article title used
  extract: text("extract"), // intro summary paragraph (nullable)
  thumbnailUrl: text("thumbnail_url"), // crest/lead image (nullable)
  articleUrl: text("article_url"), // canonical desktop URL (nullable)
  fifaRank: integer("fifa_rank"), // from infobox (nullable)
  confederation: text("confederation"), // e.g. "UEFA" (nullable)
  coach: text("coach"), // head coach name (nullable)
  nickname: text("nickname"), // e.g. "La Roja" (nullable)
  recentResults: text("recent_results"), // JSON array of best-effort form rows (nullable)
  fetchedAt: text("fetched_at").notNull(),
});
```

Every Wikipedia-derived field is **nullable** — partial data is normal and the UI
degrades gracefully. `recentResults` stores a JSON string of
`{date, opponent, result}` rows (best-effort; `[]` when none parsed). The migration is
generated with `npx drizzle-kit generate` (produces `drizzle/0006_*.sql`) and applied
with `db:migrate`.

## Wikipedia client — `src/lib/wiki/teams.ts`

Article titles are not derivable from team names reliably (USA →
"United States men's national soccer team"; Türkiye → "Turkey national football team";
Côte d'Ivoire → "Ivory Coast national football team"). So a curated
`WIKI_TITLE: Record<string, string>` maps all 48 FIFA codes to exact article titles. A
default of `"<teamName> national football team"` covers most; the map holds the
exceptions explicitly (enumerated in the implementation plan). Unknown/placeholder codes
have no entry → skipped.

Functions (all pure-parse where possible; network isolated and `try/catch`'d):

- `wikiTitle(code): string | null` — curated title or null for placeholders.
- `async fetchTeamSummary(code)` → `{ extract, thumbnailUrl, articleUrl }` via the REST
  summary API `https://en.wikipedia.org/api/rest_v1/page/summary/<title>` (clean JSON;
  follows redirects). Custom `User-Agent` like the existing scores client.
- `parseInfobox(wikitext): { fifaRank, confederation, coach, nickname }` — **pure**;
  parses `{{Infobox national football team}}` fields (`FIFA Rank`/`FIFA Max`,
  `Confederation`, `Coach`/`Manager`, `Nickname`). Tolerant: each field nullable.
- `async fetchTeamInfobox(code)` → fetches `?action=raw` wikitext, calls `parseInfobox`.
- `parseRecentResults(wikitext): {date, opponent, result}[]` — **pure**, best-effort;
  returns `[]` when nothing parseable. (Head-to-head is approximated as the team's recent
  results; honest "Recent form" framing in the UI.)
- `async buildTeamWiki(code)` → composes the above into a `team_wiki` row shape.

Parsing functions are pure and unit-tested against fixture wikitext snippets; the
network functions are thin wrappers exercised only by the fetch script (not in tests).

## Populate/refresh — `scripts/fetch-team-wiki.ts` (`npm run db:fetch-teams`)

Iterates the 48 finalist codes, calls `buildTeamWiki(code)`, upserts into `team_wiki`
(insert or update on `code`), and logs a summary: how many succeeded, and which codes
returned no extract / failed (so titles can be corrected). Idempotent; safe to re-run.
Run after deploy (and whenever data should refresh). Tolerates per-team failure (skips,
reports) rather than aborting.

## API — extend `GET /api/matches/[matchId]`

Already returns the match row + `line` + `ouLine`. Add a `teamWiki` object keyed by the
two team codes, read from the cache:

```ts
return ok({
  ...m,
  line, ouLine,
  teamWiki: {
    [m.homeTeam]: <team_wiki row | null>,
    [m.awayTeam]: <team_wiki row | null>,
  },
});
```

`recentResults` is parsed from its JSON string into an array before returning (or `[]`).
A missing cache row → `null` (page shows local facts + a graceful "details unavailable").

## Page — `src/app/(player)/match/[matchId]/page.tsx`

Client page mirroring the existing `/bet/[matchId]` data-loading pattern (fetch
`/api/matches/[matchId]`, handle pin-change redirect, errors). Sections:

1. **Header** — `teamName(home)` vs `teamName(away)`, circular flags (reuse the
   `FlagCircle`/flag assets), stage, venue, kickoff (Asia/Yangon), and score/status
   (`finalScore` helper for finished). All local data.
2. **Two team cards** — per side: crest thumbnail (or flag fallback), full name, the
   Wikipedia **extract**, a **key-facts** list (FIFA rank, confederation, coach,
   nickname — each omitted when null), and a "Read more on Wikipedia" external link
   (`articleUrl`). When the cache row is null/empty: show name + flag + a muted
   "More info coming soon".
3. **Recent form / head-to-head** — for each team, its `recentResults` rows; when both
   are empty, a muted "Recent form unavailable" line. (Honest about the best-effort
   nature.)
4. **Bet CTA** — if betting is open (`matchStarted` false and a line exists), a button to
   `/bet/[matchId]`; otherwise the appropriate closed/finished note.

External links open in a new tab with `rel="noopener noreferrer"`. No client-side
Wikipedia calls.

## Navigation — `src/components/MatchCard.tsx`

Wrap the card's informational region (rows 1–5: status chip, teams, flags, score,
schedule) in a Next `<Link href={`/match/${m.id}`}>` so tapping that area opens the
detail page. The row-6 action area (bet tiles / status note) stays outside the link, so
bet buttons keep navigating to `/bet`. Keep focus-visible styling for accessibility.

## i18n

New keys (en + mm, parity-enforced): `matchDetails`, `aboutTeam`, `keyFacts`,
`fifaRank`, `confederation`, `coach`, `nickname`, `recentForm`, `readMoreWiki`,
`infoComingSoon`, `formUnavailable`. Burmese machine-draft per convention.

## Testing

- **Unit (pure parsers)** in `src/lib/wiki/teams.test.ts`: `parseInfobox` against a
  fixture infobox snippet (extracts rank/confederation/coach/nickname; missing fields →
  null); `parseRecentResults` returns rows for a sample and `[]` for empty/garbage;
  `wikiTitle` maps a normal code and a known exception (USA) and returns null for a
  placeholder.
- **i18n parity** auto-covers the new keys.
- **Network functions / fetch script:** not unit-tested (external). Verified by running
  `npm run db:fetch-teams` against the dev DB and spot-checking rows; the script's
  success/failure report surfaces bad titles.
- **Manual:** `npm run build` + lint; eyeball `/match/[id]` on staging for a team with
  data (extract + facts render), a team missing from cache (graceful fallback), and the
  card tap (body → detail, bet tiles → bet).

## Deploy notes

- **Migration:** `npx drizzle-kit generate` → commit `drizzle/0006_*.sql`; at deploy run
  `db:migrate` against **both** `worldbet` and `worldbet_staging` (export each
  `DATABASE_URL`).
- After migrating, run `npm run db:fetch-teams` against each DB to populate the cache
  (pages render the graceful fallback until then).

## Out of scope / risks

- **No per-match Wikipedia article** exists for group games — this feature is team-centric
  by design; "head-to-head" is approximated as each team's recent form and may be empty.
- Infobox/recent-results parsing is **best-effort**; fields are nullable and the UI
  degrades. Title drift on Wikipedia is handled by the curated map + the fetch script's
  failure report.
- No admin UI for refresh in this pass (the `db:fetch-teams` script covers it); an admin
  button can be added later.
- No change to grading, settlement, schema beyond `team_wiki`, bet flow, or the board
  filter.
