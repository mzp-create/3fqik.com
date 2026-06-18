// Fetch final scores from Wikipedia's WC2026 group pages. The match-result
// templates ("football box") embed the FIFA 3-letter codes and the score
// directly in wikitext, e.g.:
//   |team1={{#invoke:flag|fb-rt|ESP}}
//   |score={{score link|...|0–0}}
//   |team2={{#invoke:flag|fb|CPV}}
// so we map straight to our home/away codes — no team-name matching needed.
//
// Group stage only (stage like "Group H"). Returns a candidate score per match
// that the admin reviews and confirms before grading — never auto-grades.

export type FetchInput = {
  id: number;
  homeTeam: string;
  awayTeam: string;
  stage: string;
};
export type ScoreCandidate = { matchId: number; home: number; away: number };

type Box = { team1: string; team2: string; home: number; away: number };

const groupPage = (letter: string) =>
  `2026_FIFA_World_Cup_Group_${encodeURIComponent(letter)}`;

async function fetchWikitext(page: string): Promise<string> {
  const url = `https://en.wikipedia.org/wiki/${page}?action=raw`;
  const res = await fetch(url, {
    headers: { "User-Agent": "WorldBet2026/1.0 (score sync)" },
    // Always fetch fresh; results change as matches finish.
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`wikipedia ${page}: HTTP ${res.status}`);
  return res.text();
}

/** Parse all finished football boxes from a group page's wikitext. */
export function parseFootballBoxes(wikitext: string): Box[] {
  const boxes: Box[] = [];
  // Each match is a "{{#invoke:football box|main ...}}" block.
  for (const part of wikitext.split(/\{\{#invoke:football box/i).slice(1)) {
    const t1 = part.match(
      /team1\s*=\s*\{\{#invoke:flag\|fb[^|}]*\|([A-Za-z]{3})/,
    );
    const t2 = part.match(
      /team2\s*=\s*\{\{#invoke:flag\|fb[^|}]*\|([A-Za-z]{3})/,
    );
    // score may be wrapped in {{score link|target|X-Y}} or bare "X-Y".
    // Dash class covers hyphen, figure/en/em dash, horizontal bar, minus sign.
    const sc = part.match(
      /score\s*=\s*(?:\{\{score link\|[^|]*\|\s*)?(\d{1,2})\s*[-‒–—―−]\s*(\d{1,2})/,
    );
    if (t1 && t2 && sc)
      boxes.push({
        team1: t1[1].toUpperCase(),
        team2: t2[1].toUpperCase(),
        home: Number(sc[1]),
        away: Number(sc[2]),
      });
  }
  return boxes;
}

/** Fetch candidate final scores for the given matches (group stage only). */
export async function fetchScores(
  matches: FetchInput[],
): Promise<{ candidates: ScoreCandidate[]; skipped: number }> {
  const byPage = new Map<string, Box[]>();
  const candidates: ScoreCandidate[] = [];
  let skipped = 0;

  for (const m of matches) {
    if (!m.stage.startsWith("Group ")) {
      skipped++;
      continue; // knockout pages have a different layout — manual for now
    }
    const page = groupPage(m.stage.slice(6).trim());
    if (!byPage.has(page)) {
      try {
        byPage.set(page, parseFootballBoxes(await fetchWikitext(page)));
      } catch {
        byPage.set(page, []);
      }
    }
    const box = byPage
      .get(page)!
      .find((b) => b.team1 === m.homeTeam && b.team2 === m.awayTeam);
    if (box) candidates.push({ matchId: m.id, home: box.home, away: box.away });
    else skipped++;
  }
  return { candidates, skipped };
}
