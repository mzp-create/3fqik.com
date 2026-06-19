// Market-reference odds from The Odds API (the-odds-api.com), shown to the
// banker in the Lines Desk for price discovery. This is a REFERENCE only — we
// never bet on it or auto-post lines from it; the banker reads it and decides.
//
// Free tier: 500 credits/month, cost = markets × regions. We pull
// h2h + spreads + totals from the `eu` region (Pinnacle et al.) = 3 credits
// per refresh (~160 refreshes/month). Requires THE_ODDS_API_KEY.
//
// NB: for soccer, The Odds API's spreads/totals coverage varies by event; a
// marquee event like the World Cup is usually well covered via Pinnacle, but
// some refreshes may return h2h only — callers handle missing markets.
import { codeFromName } from "@/lib/client/flags";
import { nowIso } from "@/lib/time";

const SPORT = "soccer_fifa_world_cup";
const PREFERRED_BOOK = "pinnacle";

/** Asian handicap reference: favourite code + line + Malay prices both sides. */
export type AhRef = {
  favCode: string;
  line: number;
  favMalay: number;
  dogMalay: number;
};
/** Totals reference: goals line + Malay prices both sides. */
export type OuRef = { line: number; overMalay: number; underMalay: number };
/** 1X2 moneyline in decimal, oriented to the feed's home/away. */
export type H2hRef = { home: number; draw: number | null; away: number };

export type RefMarket = {
  homeCode: string;
  awayCode: string;
  bookmaker: string;
  ah: AhRef | null;
  ou: OuRef | null;
  h2h: H2hRef | null;
};

export type ReferenceFetch =
  | {
      ok: true;
      markets: RefMarket[];
      fetchedAt: string;
      remaining: number | null;
    }
  | { ok: false; reason: "no_key" | "http_error" | "no_data"; message: string };

type Outcome = { name: string; price: number; point?: number };
type FeedMarket = { key: string; outcomes: Outcome[] };
type Bookmaker = { key: string; title?: string; markets: FeedMarket[] };
type OddsEvent = {
  id: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  bookmakers: Bookmaker[];
};

/**
 * Decimal odds → Malay odds.
 *  - dec ≤ 2.00: Malay = dec − 1   (positive, e.g. 1.92 → +0.92)
 *  - dec > 2.00: Malay = −1/(dec−1) (negative, e.g. 2.10 → −0.91)
 * Matches our signed-price convention (priceC = Malay × 100).
 */
export function decToMalay(dec: number): number {
  if (!dec || dec <= 1) return 0;
  const m = dec <= 2 ? dec - 1 : -1 / (dec - 1);
  return Math.round(m * 100) / 100;
}

export async function fetchReferenceOdds(): Promise<ReferenceFetch> {
  const key = process.env.THE_ODDS_API_KEY;
  if (!key)
    return {
      ok: false,
      reason: "no_key",
      message:
        "THE_ODDS_API_KEY not set. Get a free key at the-odds-api.com and add it to the environment.",
    };

  const url =
    `https://api.the-odds-api.com/v4/sports/${SPORT}/odds/` +
    `?apiKey=${encodeURIComponent(key)}&regions=eu` +
    `&markets=h2h,spreads,totals&oddsFormat=decimal`;

  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store" });
  } catch (e) {
    return {
      ok: false,
      reason: "http_error",
      message: e instanceof Error ? e.message : "network error",
    };
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return {
      ok: false,
      reason: "http_error",
      message: `The Odds API HTTP ${res.status}${body ? ` — ${body.slice(0, 160)}` : ""}`,
    };
  }

  const remainingHeader = Number(res.headers.get("x-requests-remaining"));
  const events = (await res.json()) as OddsEvent[];
  const markets: RefMarket[] = [];

  for (const ev of events) {
    const homeCode = codeFromName(ev.home_team);
    const awayCode = codeFromName(ev.away_team);
    if (!homeCode || !awayCode) continue; // not one of our fixtures / unmapped

    const book =
      ev.bookmakers.find((b) => b.key === PREFERRED_BOOK) ?? ev.bookmakers[0];
    if (!book) continue;

    const ref: RefMarket = {
      homeCode,
      awayCode,
      bookmaker: book.title ?? book.key,
      ah: null,
      ou: null,
      h2h: null,
    };

    for (const mk of book.markets) {
      if (mk.key === "h2h") {
        const h = mk.outcomes.find((o) => o.name === ev.home_team);
        const a = mk.outcomes.find((o) => o.name === ev.away_team);
        const d = mk.outcomes.find((o) => o.name === "Draw");
        if (h && a)
          ref.h2h = { home: h.price, draw: d?.price ?? null, away: a.price };
      } else if (mk.key === "spreads") {
        // The favourite is the side with the negative handicap.
        const fav = mk.outcomes.find((o) => (o.point ?? 0) < 0);
        const dog = mk.outcomes.find((o) => o !== fav);
        if (fav && dog && fav.point != null) {
          const favCode = codeFromName(fav.name);
          if (favCode)
            ref.ah = {
              favCode,
              line: Math.abs(fav.point),
              favMalay: decToMalay(fav.price),
              dogMalay: decToMalay(dog.price),
            };
        }
      } else if (mk.key === "totals") {
        const over = mk.outcomes.find((o) => o.name === "Over");
        const under = mk.outcomes.find((o) => o.name === "Under");
        if (over && under && over.point != null)
          ref.ou = {
            line: over.point,
            overMalay: decToMalay(over.price),
            underMalay: decToMalay(under.price),
          };
      }
    }
    markets.push(ref);
  }

  if (markets.length === 0)
    return {
      ok: false,
      reason: "no_data",
      message:
        "No World Cup odds matched our fixtures (the feed may have no markets open right now).",
    };

  return {
    ok: true,
    markets,
    fetchedAt: nowIso(),
    remaining: Number.isFinite(remainingHeader) ? remainingHeader : null,
  };
}
