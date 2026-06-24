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
  // Capture to end-of-line so inline templates like {{flagicon|ESP}} aren't
  // truncated at their internal "|"; clean() strips the markup afterwards.
  const re = new RegExp(`\\|\\s*${name}\\s*=\\s*([^\\n]+)`, "i");
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
 *  Returns up to 5 rows, or [] when nothing parses. */
export function parseRecentResults(wikitext: string): ResultRow[] {
  const rows: ResultRow[] = [];
  for (const part of wikitext.split(/\{\{Football box collapsible/i).slice(1)) {
    const date = part.match(/\|\s*date\s*=\s*([^\n|}]+)/i);
    const t1 = part.match(/\|\s*team1\s*=\s*([^\n|}]+)/i);
    const t2 = part.match(/\|\s*team2\s*=\s*([^\n|}]+)/i);
    const sc = part.match(/\|\s*score\s*=\s*(\d{1,2}\s*[-‒-―−]\s*\d{1,2})/i);
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

const UA = "WorldBet2026/1.0 (match detail)";

/** GET with a custom UA that retries on HTTP 429 (rate limit) with backoff,
 *  honoring Retry-After when present. Up to 5 attempts. */
async function wikiFetch(url: string): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      cache: "no-store",
    });
    if (res.status !== 429 || attempt >= 4) return res;
    const retryAfter = Number(res.headers.get("retry-after"));
    const waitMs =
      Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : 1000 * 2 ** attempt; // 1s,2s,4s,8s
    await new Promise((r) => setTimeout(r, waitMs));
  }
}

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
  const res = await wikiFetch(url);
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
  const res = await wikiFetch(url);
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
