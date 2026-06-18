"use client";
import { useT } from "@/lib/i18n";
import { ball, priceSigned } from "@/lib/client/format";
import { flag } from "@/lib/client/flags";

/** "🇲🇽 MEX" — or just the code when no flag is known (knockout placeholders). */
function teamLabel(code: string): string {
  const f = flag(code);
  return f ? `${f} ${code}` : code;
}

export type LineRow = {
  id: number;
  version: number;
  favSide: "home" | "away";
  offeredSide: "fav" | "dog" | "over" | "under";
  ballQ: number;
  priceC: number;
  status: string;
  market?: "ah" | "ou";
};
export type MatchRow = {
  id: number;
  stage: string;
  homeTeam: string;
  awayTeam: string;
  kickoffUtc: string;
  matchDay: string;
  status: "scheduled" | "live" | "finished";
  homeScore: number | null;
  awayScore: number | null;
  line: LineRow | null;
  ouLine?: LineRow | null;
};

export function MatchCard({
  match: m,
  onPick,
}: {
  match: MatchRow;
  onPick: (market: "ah" | "ou", side: "fav" | "dog" | "over" | "under") => void;
}) {
  const { t } = useT();
  const l = m.line;
  const ou = m.ouLine ?? null;
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

  // Determine whether any market exists and if at least one is not suspended/closed
  const hasAnyLine = !!(l || ou);

  return (
    <div className="mb-3 rounded-xl border border-ink/10 bg-white p-4 shadow-sm">
      {/* Eyebrow: stage + kickoff/live */}
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-semibold uppercase tracking-wider text-ink/40">
          {m.stage}
        </span>
        {m.status === "live" ? (
          <span className="flex items-center gap-1.5 rounded-sm bg-ca px-2 py-0.5 text-sm font-semibold uppercase tracking-wide text-white">
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-white" />
            {t.live}
          </span>
        ) : (
          <span className="text-sm text-ink/40">{kickoff}</span>
        )}
      </div>

      {/* Teams */}
      <p className="text-lg font-semibold text-ink">
        {teamLabel(m.homeTeam)} vs {teamLabel(m.awayTeam)}
        {m.status === "live" && m.homeScore != null && (
          <span className="ml-2 font-display text-2xl text-ca">
            {m.homeScore}–{m.awayScore}
          </span>
        )}
      </p>

      {!hasAnyLine && (
        <p className="mt-2 text-center text-base text-ink/30">—</p>
      )}

      {/* AH market row */}
      {l && l.status !== "closed" && (
        <div className="mt-2">
          {l.status === "suspended" ? (
            <p className="text-center text-base text-ink/50">⏸ {t.suspended}</p>
          ) : (
            <div className="flex gap-2">
              {l.offeredSide === "fav" ? (
                /* Favorite tile — green left rail */
                <button
                  className="relative flex-1 overflow-hidden rounded-lg border-2 border-ink bg-white p-4 text-left font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
                  style={{ minHeight: "72px" }}
                  onClick={() => onPick("ah", l.offeredSide)}
                >
                  <span className="absolute inset-y-0 left-0 w-1.5 bg-mx" />
                  <span className="block pl-2 text-base font-bold uppercase tracking-wider text-ink">
                    {teamLabel(fav)}
                  </span>
                  <span className="block pl-2 text-base text-ink/50">
                    −{ball(l.ballQ)}
                  </span>
                  <span className="font-display block pl-2 text-3xl text-mx">
                    {priceSigned(l.priceC)}
                  </span>
                </button>
              ) : (
                /* Underdog tile — blue left rail */
                <button
                  className="relative flex-1 overflow-hidden rounded-lg border-2 border-ink bg-white p-4 text-left font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
                  style={{ minHeight: "72px" }}
                  onClick={() => onPick("ah", l.offeredSide)}
                >
                  <span className="absolute inset-y-0 left-0 w-1.5 bg-us" />
                  <span className="block pl-2 text-base font-bold uppercase tracking-wider text-ink">
                    {teamLabel(dog)}
                  </span>
                  <span className="block pl-2 text-base text-ink/50">
                    +{ball(l.ballQ)}
                  </span>
                  <span className="font-display block pl-2 text-3xl text-us">
                    {priceSigned(l.priceC)}
                  </span>
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {l && l.status === "closed" && !ou && (
        <p className="mt-2 text-center text-base text-ink/30">—</p>
      )}

      {/* O/U market row */}
      {ou && ou.status !== "closed" && (
        <div className="mt-2">
          {ou.status === "suspended" ? (
            <p className="text-center text-base text-ink/50">⏸ {t.suspended}</p>
          ) : (
            <div className="flex gap-2">
              {ou.offeredSide === "over" ? (
                /* Over tile — green left rail */
                <button
                  className="relative flex-1 overflow-hidden rounded-lg border-2 border-ink bg-white p-4 text-left font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
                  style={{ minHeight: "72px" }}
                  onClick={() => onPick("ou", ou.offeredSide)}
                >
                  <span className="absolute inset-y-0 left-0 w-1.5 bg-mx" />
                  <span className="block pl-2 text-base font-bold uppercase tracking-wider text-ink">
                    O {ball(ou.ballQ)}
                  </span>
                  <span className="block pl-2 text-base text-ink/50">
                    {t.over}
                  </span>
                  <span className="font-display block pl-2 text-3xl text-mx">
                    {priceSigned(ou.priceC)}
                  </span>
                </button>
              ) : (
                /* Under tile — blue left rail */
                <button
                  className="relative flex-1 overflow-hidden rounded-lg border-2 border-ink bg-white p-4 text-left font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
                  style={{ minHeight: "72px" }}
                  onClick={() => onPick("ou", ou.offeredSide)}
                >
                  <span className="absolute inset-y-0 left-0 w-1.5 bg-us" />
                  <span className="block pl-2 text-base font-bold uppercase tracking-wider text-ink">
                    U {ball(ou.ballQ)}
                  </span>
                  <span className="block pl-2 text-base text-ink/50">
                    {t.under}
                  </span>
                  <span className="font-display block pl-2 text-3xl text-us">
                    {priceSigned(ou.priceC)}
                  </span>
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
