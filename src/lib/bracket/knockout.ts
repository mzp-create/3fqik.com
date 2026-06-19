// Resolve knockout-bracket placeholders ("2A v 2B", "1E v 3rd-best", "W73 …")
// to real teams by reading Wikipedia's already-resolved knockout fixtures.
//
// FIFA does the standings + best-thirds + advancement maths; we just READ the
// result. Wikipedia's knockout football boxes only render real FIFA codes once
// teams are decided (before that they show plain slot text like "1A", which our
// flag-code regex skips), so a fixture is filled only when it is genuinely known
// — including who advanced on penalties (reflected in the next round's box).
//
// Matching to our placeholder rows is by (stadium + date), which is unique: a
// stadium hosts at most one knockout match within any ±1-day window.
import { isFifaCode } from "@/lib/client/flags";

/** A resolved knockout fixture parsed from Wikipedia (both teams known). */
export type KnockoutBox = {
  home: string; // FIFA code (team1)
  away: string; // FIFA code (team2)
  stadium: string; // normalized stadium key
  date: string; // YYYY-MM-DD (as listed on Wikipedia)
};

/** One of our placeholder matches, enough to match + update. */
export type KoMatch = {
  id: number;
  homeTeam: string;
  awayTeam: string;
  kickoffUtc: string;
  venue: string | null;
};

/** Proposed fill for one placeholder match. */
export type Resolution = {
  matchId: number;
  home: string;
  away: string;
  from: string; // "2A v 2B" — the placeholder it replaces (for logging)
};

const KNOCKOUT_PAGE = "2026_FIFA_World_Cup_knockout_stage";

export async function fetchKnockoutWikitext(): Promise<string> {
  const url = `https://en.wikipedia.org/wiki/${KNOCKOUT_PAGE}?action=raw`;
  const res = await fetch(url, {
    headers: { "User-Agent": "WorldBet2026/1.0 (bracket sync)" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`wikipedia knockout: HTTP ${res.status}`);
  return res.text();
}

/** Normalize a stadium name to a stable key: drop wiki markup, take the part
 *  before the first comma, lowercase, keep alphanumerics only.
 *  "[[SoFi Stadium]]" and "SoFi Stadium, Los Angeles" → "sofistadium". */
export function normStadium(s: string): string {
  return s
    .replace(/\[\[([^\]|]*\|)?/g, "") // strip "[[" and any "Display|" pipe target
    .replace(/\]\]/g, "")
    .split(/[,|]/)[0]
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const MONTHS: Record<string, string> = {
  january: "01",
  february: "02",
  march: "03",
  april: "04",
  may: "05",
  june: "06",
  july: "07",
  august: "08",
  september: "09",
  october: "10",
  november: "11",
  december: "12",
};

/** Parse a Wikipedia date into "YYYY-MM-DD", else "". Handles the
 *  `{{Start date|2026|6|28}}` template (used on the knockout page) as well as
 *  plain "28 June 2026" / "June 28, 2026". */
export function parseWikiDate(raw: string): string {
  const t = raw.toLowerCase();
  // {{start date|2026|6|28}} or {{start date and age|2026|6|28|...}}
  let m = t.match(
    /\{\{\s*start date[^|}]*\|\s*(\d{4})\s*\|\s*(\d{1,2})\s*\|\s*(\d{1,2})/,
  );
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  // "28 june 2026"
  m = t.match(/(\d{1,2})\s+([a-z]+)\s+(\d{4})/);
  if (m && MONTHS[m[2]])
    return `${m[3]}-${MONTHS[m[2]]}-${m[1].padStart(2, "0")}`;
  // "june 28, 2026"
  m = t.match(/([a-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (m && MONTHS[m[1]])
    return `${m[3]}-${MONTHS[m[1]]}-${m[2].padStart(2, "0")}`;
  return "";
}

/** Parse the resolved knockout football boxes (both teams known) from wikitext. */
export function parseKnockoutBoxes(wikitext: string): KnockoutBox[] {
  const boxes: KnockoutBox[] = [];
  for (const part of wikitext.split(/\{\{#invoke:football box/i).slice(1)) {
    const t1 = part.match(
      /team1\s*=\s*\{\{#invoke:flag\|fb[^|}]*\|([A-Za-z]{3})/,
    );
    const t2 = part.match(
      /team2\s*=\s*\{\{#invoke:flag\|fb[^|}]*\|([A-Za-z]{3})/,
    );
    if (!t1 || !t2) continue; // teams not yet decided → slot text, skip
    const home = t1[1].toUpperCase();
    const away = t2[1].toUpperCase();
    // Capture the whole line: both values can contain pipes (wikilink targets,
    // {{Start date|Y|M|D}}), so normStadium / parseWikiDate do the extraction.
    const stadiumRaw = part.match(/stadium\s*=\s*([^\n]+)/);
    const dateRaw = part.match(/\bdate\s*=\s*([^\n]+)/);
    boxes.push({
      home,
      away,
      stadium: stadiumRaw ? normStadium(stadiumRaw[1]) : "",
      date: dateRaw ? parseWikiDate(dateRaw[1]) : "",
    });
  }
  return boxes;
}

/** Calendar dates within one day of each other (string "YYYY-MM-DD"). */
function within1Day(a: string, b: string): boolean {
  if (!a || !b) return false;
  const da = Date.parse(a + "T00:00:00Z");
  const db = Date.parse(b + "T00:00:00Z");
  if (Number.isNaN(da) || Number.isNaN(db)) return false;
  return Math.abs(da - db) <= 24 * 60 * 60 * 1000;
}

/** True when a team string is still a placeholder (not a real FIFA code). */
export function isPlaceholder(team: string): boolean {
  return !isFifaCode(team);
}

/**
 * Match resolved Wikipedia boxes to our still-placeholder knockout matches by
 * (stadium + date within ±1 day). Returns one resolution per uniquely matched,
 * fully-resolved fixture. Ambiguous (0 or >1 candidate) boxes are reported via
 * `skipped` rather than guessed.
 */
export function matchKnockout(
  boxes: KnockoutBox[],
  matches: KoMatch[],
): { resolutions: Resolution[]; skipped: string[] } {
  const resolutions: Resolution[] = [];
  const skipped: string[] = [];
  const used = new Set<number>();

  for (const box of boxes) {
    if (!box.stadium || !box.date) {
      skipped.push(`${box.home} v ${box.away}: missing stadium/date`);
      continue;
    }
    const candidates = matches.filter(
      (m) =>
        !used.has(m.id) &&
        (isPlaceholder(m.homeTeam) || isPlaceholder(m.awayTeam)) &&
        m.venue != null &&
        normStadium(m.venue) === box.stadium &&
        within1Day(m.kickoffUtc.slice(0, 10), box.date),
    );
    if (candidates.length !== 1) {
      skipped.push(
        `${box.home} v ${box.away} @ ${box.stadium} ${box.date}: ${candidates.length} matches`,
      );
      continue;
    }
    const m = candidates[0];
    used.add(m.id);
    resolutions.push({
      matchId: m.id,
      home: box.home,
      away: box.away,
      from: `${m.homeTeam} v ${m.awayTeam}`,
    });
  }
  return { resolutions, skipped };
}
