"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api, redirectIfPinChange } from "@/lib/client/api";
import { useT } from "@/lib/i18n";
import { errMsg } from "@/lib/client/errMsg";
import { matchStarted, finalScore } from "@/lib/client/format";
import { teamName, flagSrc } from "@/lib/client/flags";
import type { MatchRow } from "@/components/MatchCard";

type TeamWiki = {
  code: string;
  extract: string | null;
  thumbnailUrl: string | null;
  articleUrl: string | null;
  fifaRank: number | null;
  confederation: string | null;
  coach: string | null;
  nickname: string | null;
  recentResults: {
    date: string;
    team1: string;
    team2: string;
    score: string;
  }[];
};
type MatchDetail = MatchRow & {
  venue: string;
  teamWiki: Record<string, TeamWiki | undefined>;
};

function Kickoff({ iso }: { iso: string }) {
  const s = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Yangon",
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
  return <>{s}</>;
}

function TeamCircle({ code, src }: { code: string; src: string | null }) {
  return (
    <span className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-surface-2 ring-1 ring-border">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={code} className="h-full w-full object-cover" />
      ) : (
        <span className="text-xs font-bold text-faint">{code}</span>
      )}
    </span>
  );
}

function Fact({
  label,
  value,
}: {
  label: string;
  value: string | number | null;
}) {
  if (value == null || value === "") return null;
  return (
    <div className="flex justify-between gap-3 border-b border-border py-1.5 text-sm last:border-0">
      <span className="text-faint">{label}</span>
      <span className="text-right font-semibold text-ink">{value}</span>
    </div>
  );
}

function TeamSection({ code, w }: { code: string; w?: TeamWiki }) {
  const { t } = useT();
  return (
    <section className="mb-4 rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center gap-3">
        <TeamCircle code={code} src={w?.thumbnailUrl ?? flagSrc(code)} />
        <h2 className="text-lg font-bold text-ink">{teamName(code)}</h2>
      </div>
      {w?.extract ? (
        <p className="text-sm leading-relaxed text-muted">{w.extract}</p>
      ) : (
        <p className="text-sm text-faint">{t.infoComingSoon}</p>
      )}
      {w && (w.fifaRank || w.confederation || w.coach || w.nickname) && (
        <div className="mt-3">
          <h3 className="mb-1 text-xs font-bold uppercase tracking-wider text-faint">
            {t.keyFacts}
          </h3>
          <Fact label={t.fifaRank} value={w.fifaRank} />
          <Fact label={t.confederation} value={w.confederation} />
          <Fact label={t.coach} value={w.coach} />
          <Fact label={t.nickname} value={w.nickname} />
        </div>
      )}
      {w?.recentResults && w.recentResults.length > 0 && (
        <div className="mt-3">
          <h3 className="mb-1 text-xs font-bold uppercase tracking-wider text-faint">
            {t.recentForm}
          </h3>
          {w.recentResults.map((r, i) => (
            <div
              key={i}
              className="flex justify-between py-1 text-sm text-muted"
            >
              <span className="truncate">
                {r.team1} {r.score} {r.team2}
              </span>
              <span className="ml-2 shrink-0 text-faint">{r.date}</span>
            </div>
          ))}
        </div>
      )}
      {w?.articleUrl && (
        <a
          href={w.articleUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block text-sm font-semibold text-us-neon focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
        >
          {t.readMoreWiki} ↗
        </a>
      )}
    </section>
  );
}

export default function MatchDetailPage() {
  const { t } = useT();
  const params = useParams<{ matchId: string }>();
  const matchId = Number(params.matchId);
  const [m, setM] = useState<MatchDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<MatchDetail>(`/api/matches/${matchId}`)
      .then(setM)
      .catch((e) => {
        if (!redirectIfPinChange(e)) setError(errMsg(t, e));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  if (error)
    return (
      <main className="p-3">
        <p className="mt-8 text-center text-ca">{error}</p>
      </main>
    );
  if (!m)
    return (
      <main className="p-3">
        <p className="mt-8 text-center text-faint">…</p>
      </main>
    );

  const ft = finalScore(m.status, m.homeScore, m.awayScore);
  const canBet = !matchStarted(m) && !!m.line;

  return (
    <main className="p-3">
      <Link
        href="/"
        className="mb-3 inline-block text-sm text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
      >
        ← {t.backToMatches}
      </Link>

      {/* Header: local match facts */}
      <div className="mb-4 rounded-xl border border-border bg-surface p-4 text-center">
        <p className="text-xs font-semibold uppercase tracking-wider text-faint">
          {m.stage}
        </p>
        <h1 className="mt-1 text-xl font-bold text-ink">
          {teamName(m.homeTeam)} vs {teamName(m.awayTeam)}
        </h1>
        {ft && <p className="font-display mt-1 text-3xl text-ink">{ft}</p>}
        <p className="mt-1 text-sm text-muted">
          <Kickoff iso={m.kickoffUtc} />
        </p>
        <p className="text-sm text-faint">{m.venue}</p>
      </div>

      <TeamSection code={m.homeTeam} w={m.teamWiki[m.homeTeam]} />
      <TeamSection code={m.awayTeam} w={m.teamWiki[m.awayTeam]} />

      {canBet && (
        <Link
          href={`/bet/${m.id}`}
          className="block rounded-xl border-2 border-mx bg-mx/10 py-3 text-center text-base font-bold text-mx-neon focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
        >
          {t.betPageTitle}
        </Link>
      )}
    </main>
  );
}
