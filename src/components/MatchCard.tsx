"use client";
import { useState } from "react";
import { useT } from "@/lib/i18n";
import type { Dict } from "@/lib/i18n/en";
import { ball, priceSigned, matchStarted } from "@/lib/client/format";
import { teamName, flagSrc } from "@/lib/client/flags";

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

const yangon = (opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Yangon", ...opts });

/** Circular flag image; neutral code-chip when the team has no flag (e.g. "W73"). */
function FlagCircle({ code }: { code: string }) {
  const src = flagSrc(code);
  return (
    <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-surface-2 ring-1 ring-border">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={code} className="h-full w-full object-cover" />
      ) : (
        <span className="text-[11px] font-bold text-faint">{code}</span>
      )}
    </span>
  );
}

/** Row-1 status chip — color differs per status. */
function StatusChip({ status, t }: { status: MatchRow["status"]; t: Dict }) {
  if (status === "live")
    return (
      <span className="flex items-center gap-1.5 rounded-sm bg-ca px-2 py-0.5 text-sm font-semibold uppercase tracking-wide text-white">
        <span className="live-dot h-1.5 w-1.5 rounded-full bg-white" />
        {t.live}
      </span>
    );
  if (status === "finished")
    return (
      <span className="rounded-sm bg-surface-2 px-2 py-0.5 text-sm font-semibold uppercase tracking-wide text-mx-neon/80">
        {t.statusCompleted}
      </span>
    );
  return (
    <span className="rounded-sm bg-surface-2 px-2 py-0.5 text-sm font-semibold uppercase tracking-wide text-muted">
      {t.statusScheduled}
    </span>
  );
}

/** Rows 2–3 per team: name, code, circular flag (center-aligned column). */
function TeamColumn({ code }: { code: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center">
      <span className="max-w-full truncate text-base font-bold text-ink">
        {teamName(code)}
      </span>
      <span className="text-xs font-semibold text-faint">{code}</span>
      <FlagCircle code={code} />
    </div>
  );
}

/** Center cell: "vs" for scheduled, score (Anton) for live/finished. */
function CenterCell({ m, t }: { m: MatchRow; t: Dict }) {
  const showScore = m.status === "live" || m.status === "finished";
  if (!showScore)
    return <span className="font-display pt-1 text-xl text-faint">{t.vs}</span>;
  return (
    <span
      className={`font-display whitespace-nowrap pt-1 text-3xl ${
        m.status === "live" ? "text-ca" : "text-ink"
      }`}
    >
      {m.homeScore ?? 0}
      <span className="px-1 text-muted">–</span>
      {m.awayScore ?? 0}
    </span>
  );
}

/** Row-6 status note (non-betting states), kept at a consistent height. */
function ActionNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex min-h-[72px] items-center justify-center rounded-lg bg-raised px-3 py-2 text-center text-sm font-semibold text-muted">
      {children}
    </p>
  );
}

/** Two-tile AH/OU market block (favourite/over + optional opposite). */
function MarketTiles({
  line: l,
  labels,
  subLabels,
  onPick,
}: {
  line: LineRow;
  labels: { fav: string; dog: string };
  subLabels: { fav: string; dog: string };
  onPick: (side: "fav" | "dog" | "over" | "under") => void;
}) {
  const isOu = l.market === "ou";
  const favSide = isOu ? "over" : "fav";
  const dogSide = isOu ? "under" : "dog";
  return (
    <div className="flex gap-2">
      {/* Favourite / Over — green rail */}
      <button
        className="relative flex-1 overflow-hidden rounded-lg border-2 border-border bg-raised p-4 text-left font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
        style={{ minHeight: "72px" }}
        onClick={() => onPick(favSide)}
      >
        <span className="absolute inset-y-0 left-0 w-1.5 bg-mx" />
        <span className="block pl-2 text-base font-bold uppercase tracking-wider text-ink">
          {labels.fav}
        </span>
        <span className="block pl-2 text-base text-muted">{subLabels.fav}</span>
        <span className="font-display block pl-2 text-3xl text-mx-neon">
          {priceSigned(l.priceC)}
        </span>
      </button>
      {/* Underdog / Under — blue rail (only when priced) */}
      {l.priceOppC != null && (
        <button
          className="relative flex-1 overflow-hidden rounded-lg border-2 border-border bg-raised p-4 text-left font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
          style={{ minHeight: "72px" }}
          onClick={() => onPick(dogSide)}
        >
          <span className="absolute inset-y-0 left-0 w-1.5 bg-us" />
          <span className="block pl-2 text-base font-bold uppercase tracking-wider text-ink">
            {labels.dog}
          </span>
          <span className="block pl-2 text-base text-muted">
            {subLabels.dog}
          </span>
          <span className="font-display block pl-2 text-3xl text-us-neon">
            {priceSigned(l.priceOppC)}
          </span>
        </button>
      )}
    </div>
  );
}

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
  const favLabel = l?.favSide === "home" ? m.homeTeam : m.awayTeam;
  const dogLabel = l?.favSide === "home" ? m.awayTeam : m.homeTeam;

  const dt = new Date(m.kickoffUtc);
  const koTime = yangon({
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(dt);
  const schedule = `${yangon({ weekday: "short", day: "2-digit", month: "short" }).format(dt)} · ${koTime}`;

  const started = matchStarted(m);
  const hasOpenAh = !!l && l.status !== "closed";
  const hasOpenOu = !!ou && ou.status !== "closed";

  // ── Row 6: betting tiles or a status message ────────────────────────
  function renderAction() {
    if (m.status === "live")
      return <ActionNote>⏸ {t.bettingClosedLive}</ActionNote>;
    if (m.status === "finished")
      return <ActionNote>✓ {t.matchFinishedNote}</ActionNote>;
    // scheduled:
    if (started) return <ActionNote>⏸ {t.matchStartedNote}</ActionNote>;
    if (!hasOpenAh && !hasOpenOu)
      return (
        <ActionNote>
          {t.linesSoon} · {t.kicksOff} {koTime}
        </ActionNote>
      );
    return (
      <div className="space-y-2">
        {hasOpenAh &&
          (l!.status === "suspended" ? (
            <ActionNote>⏸ {t.suspended}</ActionNote>
          ) : (
            <MarketTiles
              line={{ ...l!, market: "ah" }}
              labels={{ fav: teamName(favLabel), dog: teamName(dogLabel) }}
              subLabels={{
                fav: `−${ball(l!.ballQ)}`,
                dog: `+${ball(l!.ballQ)}`,
              }}
              onPick={(side) => onPick("ah", side)}
            />
          ))}
        {hasOpenOu && (
          <div>
            <button
              onClick={() => setShowOu((v) => !v)}
              aria-expanded={showOu}
              className="flex w-full items-center justify-between rounded-lg px-1 py-1.5 text-sm font-semibold text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
            >
              <span>
                {t.marketOu}
                {ou!.status === "suspended" ? "" : ` ${ball(ou!.ballQ)}`}
              </span>
              <span>{showOu ? `${t.hideOu} ⌃` : `${t.showOu} ⌄`}</span>
            </button>
            {showOu &&
              (ou!.status === "suspended" ? (
                <ActionNote>⏸ {t.suspended}</ActionNote>
              ) : (
                <MarketTiles
                  line={{ ...ou!, market: "ou" }}
                  labels={{
                    fav: `O ${ball(ou!.ballQ)}`,
                    dog: `U ${ball(ou!.ballQ)}`,
                  }}
                  subLabels={{ fav: t.over, dog: t.under }}
                  onPick={(side) => onPick("ou", side)}
                />
              ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mb-2 rounded-xl border border-border bg-surface p-4 shadow-sm">
      {/* Row 1 — status + stage */}
      <div className="mb-3 flex items-center justify-between">
        <StatusChip status={m.status} t={t} />
        <span className="text-xs font-semibold uppercase tracking-wider text-faint">
          {m.stage}
        </span>
      </div>

      {/* Rows 2–4 — names/codes, flags, score */}
      <div className="flex items-start gap-2">
        <TeamColumn code={m.homeTeam} />
        <div className="flex flex-col items-center self-center px-1">
          <CenterCell m={m} t={t} />
        </div>
        <TeamColumn code={m.awayTeam} />
      </div>

      {/* Row 5 — schedule */}
      <p className="mt-3 text-center text-sm text-muted">{schedule}</p>

      {/* Row 6 — action area */}
      <div className="mt-2">{renderAction()}</div>
    </div>
  );
}
