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
      className={`mb-3 rounded-xl border border-ink/10 bg-white p-3 shadow-sm ${l?.status === "suspended" ? "opacity-50" : ""}`}
    >
      {/* Eyebrow: stage + kickoff/live */}
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-ink/40">
          {m.stage}
        </span>
        {m.status === "live" ? (
          <span className="flex items-center gap-1.5 rounded-sm bg-ca px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-white">
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-white" />
            {t.live}
          </span>
        ) : (
          <span className="text-xs text-ink/40">{kickoff}</span>
        )}
      </div>

      {/* Teams */}
      <p className="font-semibold text-ink">
        {m.homeTeam} vs {m.awayTeam}
        {m.status === "live" && m.homeScore != null && (
          <span className="ml-2 font-display text-lg text-ca">
            {m.homeScore}–{m.awayScore}
          </span>
        )}
      </p>

      {!l && <p className="mt-2 text-center text-sm text-ink/30">—</p>}
      {l && l.status === "closed" && (
        <p className="mt-2 text-center text-sm text-ink/30">—</p>
      )}
      {l && l.status === "suspended" && (
        <p className="mt-2 text-center text-sm">⏸ {t.suspended}</p>
      )}
      {l && l.status === "active" && (
        <div className="mt-2 flex gap-2">
          {/* Favorite tile — green left rail */}
          <button
            className="relative flex-1 overflow-hidden rounded-lg border-2 border-ink bg-white p-3 text-left font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
            onClick={() => onPick("fav")}
          >
            <span className="absolute inset-y-0 left-0 w-1.5 bg-mx" />
            <span className="block pl-2 text-xs font-bold uppercase tracking-wider text-ink">
              {fav}
            </span>
            <span className="block pl-2 text-xs text-ink/50">
              −{ball(l.ballQ)}
            </span>
            <span className="font-display block pl-2 text-xl text-mx">
              {price(l.priceC)}
            </span>
          </button>

          {/* Underdog tile — blue left rail */}
          <button
            className="relative flex-1 overflow-hidden rounded-lg border-2 border-ink bg-white p-3 text-left font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
            onClick={() => onPick("dog")}
          >
            <span className="absolute inset-y-0 left-0 w-1.5 bg-us" />
            <span className="block pl-2 text-xs font-bold uppercase tracking-wider text-ink">
              {dog}
            </span>
            <span className="block pl-2 text-xs text-ink/50">
              +{ball(l.ballQ)}
            </span>
            <span className="font-display block pl-2 text-xl text-us">
              {price(l.priceC)}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
