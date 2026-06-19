"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, redirectIfPinChange } from "@/lib/client/api";
import { useSse } from "@/lib/client/useSse";
import { useT } from "@/lib/i18n";
import type { Dict } from "@/lib/i18n/en";
import { errMsg } from "@/lib/client/errMsg";
import {
  todayMmt,
  tomorrowMmt,
  dayLabel,
  stageSection,
} from "@/lib/client/format";
import { flag, teamName } from "@/lib/client/flags";
import { MatchCard, type MatchRow } from "@/components/MatchCard";

type View = "day" | "group";

export default function MatchesPage() {
  const { t } = useT();
  const router = useRouter();
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [view, setView] = useState<View>("day");
  const [error, setError] = useState("");

  const reload = () =>
    api<MatchRow[]>("/api/matches")
      .then(setMatches)
      .catch((e) => {
        if (!redirectIfPinChange(e)) setError(errMsg(t, e));
      });
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useSse(
    {
      line_update: () => reload(),
      score_update: () => reload(),
      match_final: () => reload(),
    },
    reload,
  );

  function onPick(m: MatchRow) {
    return (market: "ah" | "ou", side: "fav" | "dog" | "over" | "under") => {
      router.push(`/bet/${m.id}?market=${market}&side=${side}`);
    };
  }

  return (
    <main className="p-3">
      {/* View toggle */}
      <div className="mb-4 flex gap-1 rounded-xl bg-ink/5 p-1">
        <TabButton active={view === "day"} onClick={() => setView("day")}>
          {t.byDay}
        </TabButton>
        <TabButton active={view === "group"} onClick={() => setView("group")}>
          {t.byGroup}
        </TabButton>
      </div>

      {error && <p className="mt-8 text-center text-red-600">{error}</p>}

      {view === "day" ? (
        <ByDay matches={matches} onPick={onPick} t={t} />
      ) : (
        <ByGroup matches={matches} t={t} />
      )}
    </main>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-lg py-2 text-base font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us ${
        active ? "bg-white text-ink shadow-sm" : "text-ink/50"
      }`}
    >
      {children}
    </button>
  );
}

function DayTag({ tag, t }: { tag: string; t: Dict }) {
  const label =
    tag === "Today" ? t.today : tag === "Tomorrow" ? t.tomorrow : tag;
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-bold ${
        tag === "Today"
          ? "bg-mx/10 text-mx"
          : tag === "Overdue"
            ? "bg-ca/10 text-ca"
            : "bg-ink/5 text-ink/60"
      }`}
    >
      {label}
    </span>
  );
}

/** By-day betting board: upcoming/live matches under sticky date headers. */
function ByDay({
  matches,
  onPick,
  t,
}: {
  matches: MatchRow[];
  onPick: (
    m: MatchRow,
  ) => (market: "ah" | "ou", side: "fav" | "dog" | "over" | "under") => void;
  t: Dict;
}) {
  const today = todayMmt();
  const tomorrow = tomorrowMmt();
  const board = matches.filter((m) => m.status !== "finished");

  const dayGroups = (() => {
    const map = new Map<string, MatchRow[]>();
    for (const m of board) {
      const list = map.get(m.matchDay) ?? [];
      list.push(m);
      map.set(m.matchDay, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  })();

  if (dayGroups.length === 0)
    return <p className="mt-8 text-center text-ink/40">{t.noBets}</p>;

  return (
    <>
      {dayGroups.map(([day, dayMatches]) => {
        const dl = dayLabel(day, today, tomorrow);
        return (
          <section key={day} className="mb-5">
            <div className="sticky top-0 z-10 -mx-3 mb-2 flex items-center gap-2 bg-canvas/95 px-3 py-2 backdrop-blur">
              <h2 className="font-display text-lg text-ink">{dl.formatted}</h2>
              {dl.tag && <DayTag tag={dl.tag} t={t} />}
            </div>
            {dayMatches.map((m) => (
              <MatchCard key={m.id} match={m} onPick={onPick(m)} />
            ))}
          </section>
        );
      })}
    </>
  );
}

/** By-group overview: Group A–L (with team list) and knockout rounds, results included. */
function ByGroup({ matches, t }: { matches: MatchRow[]; t: Dict }) {
  const sections = (() => {
    const map = new Map<
      string,
      { order: number; label: string; kind: string; matches: MatchRow[] }
    >();
    for (const m of matches) {
      const s = stageSection(m.stage);
      const label = s.labelKey ? t[s.labelKey as keyof Dict] : s.label;
      const entry = map.get(s.key) ?? {
        order: s.order,
        label,
        kind: s.kind,
        matches: [],
      };
      entry.matches.push(m);
      map.set(s.key, entry);
    }
    return [...map.values()].sort((a, b) => a.order - b.order);
  })();

  if (sections.length === 0)
    return <p className="mt-8 text-center text-ink/40">{t.noBets}</p>;

  return (
    <>
      {sections.map((sec) => {
        // The 4 group teams = distinct codes appearing in the group's fixtures.
        const teams =
          sec.kind === "group"
            ? [...new Set(sec.matches.flatMap((m) => [m.homeTeam, m.awayTeam]))]
            : [];
        const fixtures = [...sec.matches].sort((a, b) =>
          a.kickoffUtc.localeCompare(b.kickoffUtc),
        );
        return (
          <section key={sec.label} className="mb-5">
            <h2 className="mb-2 font-display text-lg text-ink">{sec.label}</h2>
            {teams.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 rounded-xl bg-white px-3 py-2 text-sm text-ink/70">
                {teams.map((code) => (
                  <span key={code} className="whitespace-nowrap">
                    {flag(code)} {teamName(code)}
                  </span>
                ))}
              </div>
            )}
            <div className="rounded-xl bg-white">
              {fixtures.map((m) => (
                <ResultRow key={m.id} m={m} t={t} />
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}

/** Compact fixture/result row (no betting) for the group overview. */
function ResultRow({ m, t }: { m: MatchRow; t: Dict }) {
  const ko = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Yangon",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(m.kickoffUtc));
  const showScore = m.status === "live" || m.status === "finished";
  const center = showScore ? `${m.homeScore ?? 0}–${m.awayScore ?? 0}` : ko;

  return (
    <div className="flex items-center gap-2 border-b border-ink/5 px-3 py-2 text-sm last:border-0">
      <span className="flex-1 truncate text-right">
        {flag(m.homeTeam)} {teamName(m.homeTeam)}
      </span>
      <span className="w-14 text-center">
        <span className={showScore ? "font-display text-base" : "text-ink/60"}>
          {center}
        </span>
        {m.status === "live" && (
          <span className="ml-1 inline-block align-middle">
            <span className="live-dot" />
          </span>
        )}
        {m.status === "finished" && (
          <div className="text-[10px] font-bold text-ink/40">{t.finished}</div>
        )}
      </span>
      <span className="flex-1 truncate">
        {teamName(m.awayTeam)} {flag(m.awayTeam)}
      </span>
    </div>
  );
}
