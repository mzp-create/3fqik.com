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
