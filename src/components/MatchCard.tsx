"use client";
import { useState } from "react";
import { useT } from "@/lib/i18n";
import { ball, priceSigned } from "@/lib/client/format";
import { flag, teamLabel } from "@/lib/client/flags";

export type LineRow = {
  id: number;
  version: number;
  favSide: "home" | "away";
  offeredSide: "fav" | "dog" | "over" | "under";
  ballQ: number;
  priceC: number; // primary side (fav/over)
  priceOppC: number | null; // opposite side (dog/under)
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
  const [showOu, setShowOu] = useState(false);
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
    <div className="mb-2 rounded-xl border border-border bg-surface p-4 shadow-sm">
      {/* Eyebrow: stage + kickoff/live */}
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-semibold uppercase tracking-wider text-faint">
          {m.stage}
        </span>
        {m.status === "live" ? (
          <span className="flex items-center gap-1.5 rounded-sm bg-ca px-2 py-0.5 text-sm font-semibold uppercase tracking-wide text-white">
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-white" />
            {t.live}
          </span>
        ) : (
          <span className="text-sm text-faint">{kickoff}</span>
        )}
      </div>

      {/* Teams */}
      <p className="text-lg font-semibold text-ink">
        {flag(m.homeTeam)} {teamLabel(m.homeTeam)} vs {flag(m.awayTeam)}{" "}
        {teamLabel(m.awayTeam)}
        {m.status === "live" && m.homeScore != null && (
          <span className="ml-2 font-display text-2xl text-ca">
            {m.homeScore}–{m.awayScore}
          </span>
        )}
      </p>

      {!hasAnyLine && (
        <p className="mt-2 text-center text-base text-faint">—</p>
      )}

      {/* AH market row — shown by default */}
      {l && l.status !== "closed" && (
        <div className="mt-2">
          {l.status === "suspended" ? (
            <p className="text-center text-base text-muted">⏸ {t.suspended}</p>
          ) : (
            <div className="flex gap-2">
              {/* Favourite tile — green left rail */}
              <button
                className="relative flex-1 overflow-hidden rounded-lg border-2 border-border bg-raised p-4 text-left font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
                style={{ minHeight: "72px" }}
                onClick={() => onPick("ah", "fav")}
              >
                <span className="absolute inset-y-0 left-0 w-1.5 bg-mx" />
                <span className="block pl-2 text-base font-bold uppercase tracking-wider text-ink">
                  {teamLabel(fav)}
                </span>
                <span className="block pl-2 text-base text-muted">
                  −{ball(l.ballQ)}
                </span>
                <span className="font-display block pl-2 text-3xl text-mx-neon">
                  {priceSigned(l.priceC)}
                </span>
              </button>
              {/* Underdog tile — blue left rail (only when priced) */}
              {l.priceOppC != null && (
                <button
                  className="relative flex-1 overflow-hidden rounded-lg border-2 border-border bg-raised p-4 text-left font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
                  style={{ minHeight: "72px" }}
                  onClick={() => onPick("ah", "dog")}
                >
                  <span className="absolute inset-y-0 left-0 w-1.5 bg-us" />
                  <span className="block pl-2 text-base font-bold uppercase tracking-wider text-ink">
                    {teamLabel(dog)}
                  </span>
                  <span className="block pl-2 text-base text-muted">
                    +{ball(l.ballQ)}
                  </span>
                  <span className="font-display block pl-2 text-3xl text-us-neon">
                    {priceSigned(l.priceOppC)}
                  </span>
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {l && l.status === "closed" && !ou && (
        <p className="mt-2 text-center text-base text-faint">—</p>
      )}

      {/* O/U market — collapsible behind a toggle */}
      {ou && ou.status !== "closed" && (
        <div className="mt-2">
          <button
            onClick={() => setShowOu((v) => !v)}
            aria-expanded={showOu}
            className="flex w-full items-center justify-between rounded-lg px-1 py-1.5 text-sm font-semibold text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
          >
            <span>
              {t.marketOu}
              {ou.status === "suspended" ? "" : ` ${ball(ou.ballQ)}`}
            </span>
            <span>{showOu ? `${t.hideOu} ⌃` : `${t.showOu} ⌄`}</span>
          </button>
          {showOu && (
            <div className="mt-1">
              {ou.status === "suspended" ? (
                <p className="text-center text-base text-muted">
                  ⏸ {t.suspended}
                </p>
              ) : (
                <div className="flex gap-2">
                  {/* Over tile — green left rail */}
                  <button
                    className="relative flex-1 overflow-hidden rounded-lg border-2 border-border bg-raised p-4 text-left font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
                    style={{ minHeight: "72px" }}
                    onClick={() => onPick("ou", "over")}
                  >
                    <span className="absolute inset-y-0 left-0 w-1.5 bg-mx" />
                    <span className="block pl-2 text-base font-bold uppercase tracking-wider text-ink">
                      O {ball(ou.ballQ)}
                    </span>
                    <span className="block pl-2 text-base text-muted">
                      {t.over}
                    </span>
                    <span className="font-display block pl-2 text-3xl text-mx-neon">
                      {priceSigned(ou.priceC)}
                    </span>
                  </button>
                  {/* Under tile — blue left rail (only when priced) */}
                  {ou.priceOppC != null && (
                    <button
                      className="relative flex-1 overflow-hidden rounded-lg border-2 border-border bg-raised p-4 text-left font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
                      style={{ minHeight: "72px" }}
                      onClick={() => onPick("ou", "under")}
                    >
                      <span className="absolute inset-y-0 left-0 w-1.5 bg-us" />
                      <span className="block pl-2 text-base font-bold uppercase tracking-wider text-ink">
                        U {ball(ou.ballQ)}
                      </span>
                      <span className="block pl-2 text-base text-muted">
                        {t.under}
                      </span>
                      <span className="font-display block pl-2 text-3xl text-us-neon">
                        {priceSigned(ou.priceOppC)}
                      </span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
