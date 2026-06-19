"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { useSse } from "@/lib/client/useSse";
import { todayMmt, tomorrowMmt, dayLabel } from "@/lib/client/format";
import { teamLabel, teamName } from "@/lib/client/flags";

type MatchRow = {
  id: number;
  homeTeam: string;
  awayTeam: string;
  status: "scheduled" | "live" | "finished";
  homeScore: number | null;
  awayScore: number | null;
  matchDay: string;
};

type ScoreLocal = { home: number; away: number };

export default function ScoresPage() {
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [scores, setScores] = useState<Record<number, ScoreLocal>>({});
  const [busy, setBusy] = useState<Record<number, boolean>>({});
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [globalError, setGlobalError] = useState("");
  // Wikipedia-fetched candidate scores (matchId -> score), pending admin confirm.
  const [fetched, setFetched] = useState<Record<number, ScoreLocal>>({});
  const [fetching, setFetching] = useState(false);
  const [fetchMsg, setFetchMsg] = useState("");

  const reload = () =>
    api<MatchRow[]>("/api/matches")
      .then((ms) => {
        const today = todayMmt();
        const relevant = ms.filter(
          (m) =>
            m.status === "live" ||
            m.status === "finished" ||
            // today's matches AND any overdue ones still awaiting a score
            (m.status === "scheduled" && m.matchDay <= today),
        );
        setMatches(ms);
        setScores((prev) => {
          const next = { ...prev };
          for (const m of relevant) {
            if (!next[m.id]) {
              next[m.id] = {
                home: m.homeScore ?? 0,
                away: m.awayScore ?? 0,
              };
            }
          }
          return next;
        });
        setLoading(false);
      })
      .catch((e) => {
        setGlobalError(e instanceof Error ? e.message : "Failed to load");
        setLoading(false);
      });

  useEffect(() => {
    void reload();
  }, []); // run once on mount

  useSse({ score_update: () => reload(), match_final: () => reload() }, reload);

  function setError(matchId: number, msg: string) {
    setErrors((prev) => ({ ...prev, [matchId]: msg }));
  }
  function setBusyFor(matchId: number, val: boolean) {
    setBusy((prev) => ({ ...prev, [matchId]: val }));
  }

  type Candidate = {
    matchId: number;
    homeTeam: string;
    awayTeam: string;
    home: number;
    away: number;
  };
  async function fetchResults() {
    setFetching(true);
    setFetchMsg("");
    try {
      const r = await api<{
        candidates: Candidate[];
        found: number;
        checked: number;
      }>("/api/admin/scores/fetch");
      const map: Record<number, ScoreLocal> = {};
      for (const c of r.candidates)
        map[c.matchId] = { home: c.home, away: c.away };
      setFetched(map);
      // Pre-fill the editable scores so Confirm uses the fetched numbers.
      setScores((prev) => ({ ...prev, ...map }));
      setFetchMsg(
        `Fetched ${r.found} of ${r.checked} match${r.checked === 1 ? "" : "es"} from Wikipedia. Review each and tap “Confirm”.`,
      );
    } catch (e) {
      setFetchMsg(e instanceof Error ? e.message : "fetch failed");
    } finally {
      setFetching(false);
    }
  }

  async function doAction(
    matchId: number,
    action: "live" | "score" | "final" | "correct",
  ) {
    const s = scores[matchId] ?? { home: 0, away: 0 };
    if (
      (action === "score" || action === "final" || action === "correct") &&
      (s.home < 0 || s.home > 99 || s.away < 0 || s.away > 99)
    ) {
      setError(matchId, "Scores must be 0–99");
      return;
    }
    if (action === "final") {
      const ok = window.confirm(
        `Confirm final score: ${s.home} – ${s.away}? This will grade all tickets.`,
      );
      if (!ok) return;
    }
    if (action === "correct") {
      const ok = window.confirm(
        `Correct score to ${s.home} – ${s.away}? This will re-grade all tickets.`,
      );
      if (!ok) return;
    }
    setError(matchId, "");
    setBusyFor(matchId, true);
    try {
      const body: Record<string, unknown> = { action, matchId };
      if (action !== "live") {
        body.home = s.home;
        body.away = s.away;
      }
      await api("/api/admin/scores", body);
      reload();
    } catch (e) {
      setError(matchId, e instanceof Error ? e.message : "error");
    } finally {
      setBusyFor(matchId, false);
    }
  }

  function adjustScore(matchId: number, side: "home" | "away", delta: number) {
    setScores((prev) => {
      const cur = prev[matchId] ?? { home: 0, away: 0 };
      const val = Math.max(0, Math.min(99, cur[side] + delta));
      return { ...prev, [matchId]: { ...cur, [side]: val } };
    });
  }

  if (globalError) return <p className="text-red-600">{globalError}</p>;
  if (loading) return <p className="text-gray-500">Loading…</p>;

  const today = todayMmt();
  const tomorrow = tomorrowMmt();
  const visible = showAll
    ? matches
    : matches.filter(
        (m) =>
          m.status === "live" ||
          m.status === "finished" ||
          // today's matches AND any overdue ones still awaiting a score
          (m.status === "scheduled" && m.matchDay <= today),
      );

  // Group the visible matches by match day, ascending.
  const dayGroups = (() => {
    const map = new Map<string, MatchRow[]>();
    for (const m of visible) {
      const list = map.get(m.matchDay) ?? [];
      list.push(m);
      map.set(m.matchDay, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  })();

  return (
    <main>
      <h1 className="mb-4 text-lg font-bold">Scores</h1>
      <div className="flex items-center gap-2 mb-1">
        <button
          onClick={fetchResults}
          disabled={fetching}
          className="rounded bg-blue-600 px-3 py-1 text-sm font-semibold text-white disabled:opacity-50"
        >
          {fetching ? "Fetching…" : "Fetch results (Wikipedia)"}
        </button>
        <button
          onClick={() => setShowAll((v) => !v)}
          className="ml-auto text-xs border px-2 py-1 rounded text-gray-600"
        >
          {showAll ? "Show relevant" : "Show all"}
        </button>
      </div>
      {fetchMsg && <p className="mb-3 text-sm text-blue-700">{fetchMsg}</p>}
      {visible.length === 0 && !showAll && (
        <p className="text-gray-500 text-sm mb-3">No matches today.</p>
      )}
      {dayGroups.map(([day, dayMatches]) => {
        const dl = dayLabel(day, today, tomorrow);
        return (
          <section key={day} className="mb-6">
            <div className="sticky top-0 z-10 -mx-1 mb-3 flex items-center gap-2 border-b bg-white/95 px-1 py-1.5 backdrop-blur">
              <h2 className="text-base font-bold">{dl.formatted}</h2>
              {dl.tag && (
                <span
                  className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
                    dl.tag === "Overdue"
                      ? "bg-red-100 text-red-700"
                      : dl.tag === "Today"
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {dl.tag}
                </span>
              )}
              <span className="ml-auto text-xs text-gray-400">
                {dayMatches.length}{" "}
                {dayMatches.length === 1 ? "match" : "matches"}
              </span>
            </div>
            {dayMatches.map((m) => {
              const s = scores[m.id] ?? { home: 0, away: 0 };
              const isBusy = busy[m.id] ?? false;
              const err = errors[m.id] ?? "";

              return (
                <div key={m.id} className="mb-5 rounded border p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold">
                      {teamLabel(m.homeTeam)} vs {teamLabel(m.awayTeam)}
                    </span>
                    <span
                      className={`text-xs px-1 rounded ${
                        m.status === "live"
                          ? "bg-green-100 text-green-700"
                          : m.status === "finished"
                            ? "bg-gray-200 text-gray-600"
                            : "bg-blue-50 text-blue-600"
                      }`}
                    >
                      {m.status}
                    </span>
                  </div>

                  {/* Wikipedia-fetched score awaiting confirmation */}
                  {fetched[m.id] && m.status !== "finished" && (
                    <div className="mb-2 flex items-center gap-2 rounded border border-blue-200 bg-blue-50 px-2 py-1.5 text-sm">
                      <span className="text-blue-800">
                        Wikipedia:{" "}
                        <b>
                          {m.homeTeam} {fetched[m.id].home}–{fetched[m.id].away}{" "}
                          {m.awayTeam}
                        </b>
                      </span>
                      <button
                        disabled={isBusy}
                        onClick={() => doAction(m.id, "final")}
                        className="ml-auto rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        Confirm &amp; grade
                      </button>
                    </div>
                  )}

                  {/* Kick off button for scheduled matches */}
                  {m.status === "scheduled" && (
                    <button
                      disabled={isBusy}
                      onClick={() => doAction(m.id, "live")}
                      className="mb-2 bg-green-600 text-white text-sm px-3 py-1 rounded disabled:opacity-50"
                    >
                      Kick Off
                    </button>
                  )}

                  {/* Score steppers for live matches */}
                  {m.status === "live" && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 text-sm">
                        <span className="w-28 truncate">
                          {teamName(m.homeTeam)}
                        </span>
                        <button
                          className="border rounded px-2 py-0.5"
                          onClick={() => adjustScore(m.id, "home", -1)}
                        >
                          −
                        </button>
                        <span className="w-8 text-center font-bold text-lg">
                          {s.home}
                        </span>
                        <button
                          className="border rounded px-2 py-0.5"
                          onClick={() => adjustScore(m.id, "home", 1)}
                        >
                          +
                        </button>
                        <button
                          disabled={isBusy}
                          onClick={() => doAction(m.id, "score")}
                          className="ml-auto text-xs border px-2 py-1 rounded disabled:opacity-50"
                        >
                          Update
                        </button>
                      </div>
                      <div className="flex items-center gap-3 text-sm">
                        <span className="w-28 truncate">
                          {teamName(m.awayTeam)}
                        </span>
                        <button
                          className="border rounded px-2 py-0.5"
                          onClick={() => adjustScore(m.id, "away", -1)}
                        >
                          −
                        </button>
                        <span className="w-8 text-center font-bold text-lg">
                          {s.away}
                        </span>
                        <button
                          className="border rounded px-2 py-0.5"
                          onClick={() => adjustScore(m.id, "away", 1)}
                        >
                          +
                        </button>
                      </div>
                      <button
                        disabled={isBusy}
                        onClick={() => doAction(m.id, "final")}
                        className="bg-red-600 text-white text-sm px-3 py-1 rounded disabled:opacity-50"
                      >
                        Confirm Final
                      </button>
                    </div>
                  )}

                  {/* Correct score for finished matches */}
                  {m.status === "finished" && (
                    <div className="space-y-2">
                      <div className="text-sm text-gray-600 mb-1">
                        Official: {m.homeScore ?? "?"} – {m.awayScore ?? "?"}
                      </div>
                      <div className="flex items-center gap-3 text-sm">
                        <span className="w-28 truncate">
                          {teamName(m.homeTeam)}
                        </span>
                        <button
                          className="border rounded px-2 py-0.5"
                          onClick={() => adjustScore(m.id, "home", -1)}
                        >
                          −
                        </button>
                        <span className="w-8 text-center font-bold">
                          {s.home}
                        </span>
                        <button
                          className="border rounded px-2 py-0.5"
                          onClick={() => adjustScore(m.id, "home", 1)}
                        >
                          +
                        </button>
                      </div>
                      <div className="flex items-center gap-3 text-sm">
                        <span className="w-28 truncate">
                          {teamName(m.awayTeam)}
                        </span>
                        <button
                          className="border rounded px-2 py-0.5"
                          onClick={() => adjustScore(m.id, "away", -1)}
                        >
                          −
                        </button>
                        <span className="w-8 text-center font-bold">
                          {s.away}
                        </span>
                        <button
                          className="border rounded px-2 py-0.5"
                          onClick={() => adjustScore(m.id, "away", 1)}
                        >
                          +
                        </button>
                      </div>
                      <button
                        disabled={isBusy}
                        onClick={() => doAction(m.id, "correct")}
                        className="border border-orange-400 text-orange-700 text-sm px-3 py-1 rounded disabled:opacity-50"
                      >
                        Correct Score
                      </button>
                    </div>
                  )}

                  {err && <p className="text-red-600 text-sm mt-2">{err}</p>}
                </div>
              );
            })}
          </section>
        );
      })}
    </main>
  );
}
