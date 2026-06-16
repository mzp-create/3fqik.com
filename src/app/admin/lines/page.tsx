"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { useSse } from "@/lib/client/useSse";
import {
  ball,
  price,
  mmk,
  todayMmt,
  tomorrowMmt,
  dayLabel,
} from "@/lib/client/format";
import { LineGrid } from "@/components/admin/LineGrid";

type Line = {
  id: number;
  matchId: number;
  version: number;
  favSide: "home" | "away";
  ballQ: number;
  priceC: number;
  status: "active" | "suspended" | "closed";
  market: "ah" | "ou";
};

type MatchRow = {
  id: number;
  homeTeam: string;
  awayTeam: string;
  status: "scheduled" | "live" | "finished";
  matchDay: string;
  betLimitMmk: number | null;
  line: Line | null;
  ouLine: Line | null;
};

type AhFormState = {
  favSide: "home" | "away";
  ballQ: number; // stored as quarter units (×4)
  priceC: number; // stored ×100
  priceCInput: string; // raw string for the price input
};

type OuFormState = {
  ballQ: number; // stored as quarter units (×4), min 1 (=0.25)
  priceC: number;
  priceCInput: string;
};

function initAhForm(line?: Line | null): AhFormState {
  if (line) {
    return {
      favSide: line.favSide,
      ballQ: line.ballQ,
      priceC: line.priceC,
      priceCInput: (line.priceC / 100).toFixed(2),
    };
  }
  return { favSide: "home", ballQ: 4, priceC: 92, priceCInput: "0.92" };
}

function initOuForm(line?: Line | null): OuFormState {
  if (line) {
    return {
      ballQ: line.ballQ,
      priceC: line.priceC,
      priceCInput: (line.priceC / 100).toFixed(2),
    };
  }
  // default 2.5 goals = ballQ 10
  return { ballQ: 10, priceC: 90, priceCInput: "0.90" };
}

export default function LinesPage() {
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [view, setView] = useState<"detailed" | "grid">("detailed");
  const [ahForms, setAhForms] = useState<Record<number, AhFormState>>({});
  const [ouForms, setOuForms] = useState<Record<number, OuFormState>>({});
  const [limits, setLimits] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<Record<number, boolean>>({});
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [globalError, setGlobalError] = useState("");

  const reload = () =>
    api<MatchRow[]>("/api/matches")
      .then((ms) => {
        const active = ms.filter((m) => m.status !== "finished");
        setMatches(active);
        setAhForms((prev) => {
          const next = { ...prev };
          for (const m of active) {
            next[m.id] = initAhForm(m.line);
          }
          return next;
        });
        setOuForms((prev) => {
          const next = { ...prev };
          for (const m of active) {
            next[m.id] = initOuForm(m.ouLine);
          }
          return next;
        });
        setLimits((prev) => {
          const next = { ...prev };
          for (const m of active) {
            if (next[m.id] === undefined)
              next[m.id] = m.betLimitMmk != null ? String(m.betLimitMmk) : "";
          }
          return next;
        });
      })
      .catch((e) =>
        setGlobalError(e instanceof Error ? e.message : "Failed to load"),
      );

  useEffect(() => {
    reload();
  }, []); // run once on mount — reload is stable (no deps change its identity)

  useSse({ line_update: () => reload(), score_update: () => reload() }, reload);

  function setError(matchId: number, msg: string) {
    setErrors((prev) => ({ ...prev, [matchId]: msg }));
  }
  function setBusyFor(matchId: number, val: boolean) {
    setBusy((prev) => ({ ...prev, [matchId]: val }));
  }

  async function postAhLine(matchId: number) {
    const f = ahForms[matchId];
    if (!f) return;
    const parsedPrice = parseFloat(f.priceCInput);
    if (isNaN(parsedPrice) || parsedPrice <= 0 || parsedPrice > 1) {
      setError(matchId, "AH on-the-line payout must be between 0.01 and 1.00");
      return;
    }
    const priceC = Math.round(parsedPrice * 100);
    if (priceC < 1 || priceC > 100) {
      setError(matchId, "AH on-the-line payout must be between 0.01 and 1.00");
      return;
    }
    // Favourite-flip guard: warn admin if the new line's favourite side differs
    // from the current posted AH line (only applies when a line already exists).
    const matchRow = matches.find((m) => m.id === matchId);
    if (matchRow && matchRow.line && matchRow.line.favSide !== f.favSide) {
      const currentFavTeam =
        matchRow.line.favSide === "home"
          ? matchRow.homeTeam
          : matchRow.awayTeam;
      const newFavTeam =
        f.favSide === "home" ? matchRow.homeTeam : matchRow.awayTeam;
      const confirmed = window.confirm(
        `Switch favourite from ${currentFavTeam} to ${newFavTeam} on ${matchRow.homeTeam} vs ${matchRow.awayTeam}? This flips which side bettors are backing.`,
      );
      if (!confirmed) return;
    }
    setError(matchId, "");
    setBusyFor(matchId, true);
    try {
      await api("/api/admin/lines", {
        action: "post",
        matchId,
        market: "ah",
        favSide: f.favSide,
        ballQ: f.ballQ,
        priceC,
      });
      reload();
    } catch (e) {
      setError(matchId, e instanceof Error ? e.message : "error");
    } finally {
      setBusyFor(matchId, false);
    }
  }

  async function postOuLine(matchId: number) {
    const f = ouForms[matchId];
    if (!f) return;
    const parsedPrice = parseFloat(f.priceCInput);
    if (isNaN(parsedPrice) || parsedPrice <= 0 || parsedPrice > 1) {
      setError(matchId, "O/U on-the-line payout must be between 0.01 and 1.00");
      return;
    }
    const priceC = Math.round(parsedPrice * 100);
    if (priceC < 1 || priceC > 100) {
      setError(matchId, "O/U on-the-line payout must be between 0.01 and 1.00");
      return;
    }
    if (f.ballQ < 1) {
      setError(matchId, "O/U goals line must be at least 0.25 (ballQ ≥ 1)");
      return;
    }
    setError(matchId, "");
    setBusyFor(matchId, true);
    try {
      // For ou market, favSide is semantically meaningless (grading ignores it);
      // we pass 'home' as a stored dummy per manage.ts convention.
      await api("/api/admin/lines", {
        action: "post",
        matchId,
        market: "ou",
        favSide: "home",
        ballQ: f.ballQ,
        priceC,
      });
      reload();
    } catch (e) {
      setError(matchId, e instanceof Error ? e.message : "error");
    } finally {
      setBusyFor(matchId, false);
    }
  }

  async function lineAction(
    matchId: number,
    market: "ah" | "ou",
    action: "suspend" | "resume" | "close",
  ) {
    setError(matchId, "");
    setBusyFor(matchId, true);
    try {
      await api("/api/admin/lines", { action, matchId, market });
      reload();
    } catch (e) {
      setError(matchId, e instanceof Error ? e.message : "error");
    } finally {
      setBusyFor(matchId, false);
    }
  }

  async function saveLimit(matchId: number) {
    const raw = limits[matchId] ?? "";
    const val = raw === "" ? null : parseInt(raw, 10);
    if (raw !== "" && (isNaN(val as number) || (val as number) < 0)) {
      setError(
        matchId,
        "Limit must be a non-negative integer (blank = unlimited)",
      );
      return;
    }
    setError(matchId, "");
    setBusyFor(matchId, true);
    try {
      await api("/api/admin/settings", { matchId, betLimitMmk: val });
      reload();
    } catch (e) {
      setError(matchId, e instanceof Error ? e.message : "error");
    } finally {
      setBusyFor(matchId, false);
    }
  }

  function updateAhForm(matchId: number, patch: Partial<AhFormState>) {
    setAhForms((prev) => ({
      ...prev,
      [matchId]: { ...prev[matchId], ...patch },
    }));
  }

  function updateOuForm(matchId: number, patch: Partial<OuFormState>) {
    setOuForms((prev) => ({
      ...prev,
      [matchId]: { ...prev[matchId], ...patch },
    }));
  }

  if (globalError) return <p className="text-red-600">{globalError}</p>;

  const today = todayMmt();
  const tomorrow = tomorrowMmt();
  // Relevant view: live, today/tomorrow, AND overdue (past but still scheduled —
  // e.g. a match awaiting its final score) so nothing silently drops off.
  const visible = showAll
    ? matches
    : matches.filter(
        (m) =>
          m.status === "live" ||
          (m.status === "scheduled" && m.matchDay <= tomorrow),
      );

  // Group the visible matches by match day, days in ascending order.
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
      <h1 className="mb-4 text-lg font-bold">Lines Desk</h1>
      <div className="flex items-center gap-2 mb-3">
        <div className="flex gap-1 rounded-lg bg-gray-100 p-0.5">
          <button
            onClick={() => setView("detailed")}
            className={`rounded-md px-3 py-1 text-sm font-semibold ${
              view === "detailed" ? "bg-white shadow-sm" : "text-gray-500"
            }`}
          >
            Detailed
          </button>
          <button
            onClick={() => setView("grid")}
            className={`rounded-md px-3 py-1 text-sm font-semibold ${
              view === "grid" ? "bg-white shadow-sm" : "text-gray-500"
            }`}
          >
            Grid
          </button>
        </div>
        <button
          onClick={() => setShowAll((v) => !v)}
          className="ml-auto text-xs border px-2 py-1 rounded text-gray-600"
        >
          {showAll ? "Show relevant" : "Show all"}
        </button>
      </div>

      {visible.length === 0 && !showAll && (
        <p className="text-gray-500 text-sm">
          No live, upcoming, or overdue matches.
        </p>
      )}

      {view === "grid" && visible.length > 0 && (
        <LineGrid
          matches={visible}
          today={today}
          tomorrow={tomorrow}
          onSaved={reload}
        />
      )}

      {view === "detailed" &&
        dayGroups.map(([day, dayMatches]) => {
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
                const ahF = ahForms[m.id] ?? initAhForm();
                const ouF = ouForms[m.id] ?? initOuForm();
                const isBusy = busy[m.id] ?? false;
                const err = errors[m.id] ?? "";
                return (
                  <div key={m.id} className="mb-6 rounded border p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold">
                        {m.homeTeam} vs {m.awayTeam}
                      </span>
                      <span
                        className={`text-xs px-1 rounded ${
                          m.status === "live"
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {m.status}
                      </span>
                    </div>

                    {/* ── HANDICAP (AH) MARKET ── */}
                    <div className="mb-4 rounded border border-gray-100 bg-gray-50 p-2">
                      <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">
                        Handicap (AH)
                      </p>

                      {/* Current AH line summary */}
                      {m.line ? (
                        <div className="text-sm mb-2 text-gray-700">
                          Line:{" "}
                          {m.line.favSide === "home" ? m.homeTeam : m.awayTeam}
                          {" −"}
                          {ball(m.line.ballQ)} @ {price(m.line.priceC)}
                          <span
                            className={`ml-2 px-1 rounded text-xs ${
                              m.line.status === "active"
                                ? "bg-green-100 text-green-700"
                                : m.line.status === "suspended"
                                  ? "bg-yellow-100 text-yellow-700"
                                  : "bg-gray-200 text-gray-600"
                            }`}
                          >
                            {m.line.status}
                          </span>
                          <span className="ml-2 text-xs text-gray-400">
                            v{m.line.version}
                          </span>
                        </div>
                      ) : (
                        <div className="text-sm mb-2 text-gray-400">
                          No line posted
                        </div>
                      )}

                      {/* AH Post / move form */}
                      <div className="space-y-2 mb-3">
                        <div className="flex gap-2 items-center text-sm">
                          <label className="w-16 text-gray-600">Fav side</label>
                          <select
                            className="border rounded px-1 py-0.5 text-sm"
                            value={ahF.favSide}
                            onChange={(e) =>
                              updateAhForm(m.id, {
                                favSide: e.target.value as "home" | "away",
                              })
                            }
                          >
                            <option value="home">{m.homeTeam}</option>
                            <option value="away">{m.awayTeam}</option>
                          </select>
                        </div>
                        <div className="flex gap-2 items-center text-sm">
                          <label className="w-16 text-gray-600">Ball</label>
                          <button
                            className="border rounded px-2 py-0.5"
                            onClick={() =>
                              updateAhForm(m.id, {
                                ballQ: Math.max(0, ahF.ballQ - 1),
                              })
                            }
                          >
                            −
                          </button>
                          <span className="w-10 text-center">
                            {ball(ahF.ballQ)}
                          </span>
                          <button
                            className="border rounded px-2 py-0.5"
                            onClick={() =>
                              updateAhForm(m.id, {
                                ballQ: Math.min(40, ahF.ballQ + 1),
                              })
                            }
                          >
                            +
                          </button>
                        </div>
                        <div className="flex gap-2 items-center text-sm">
                          <label className="w-16 text-gray-600">Price</label>
                          <input
                            type="number"
                            step="0.01"
                            min="-1.00"
                            max="1.00"
                            className="border rounded px-2 py-0.5 w-24 text-sm"
                            value={ahF.priceCInput}
                            onChange={(e) =>
                              updateAhForm(m.id, {
                                priceCInput: e.target.value,
                              })
                            }
                          />
                        </div>
                        <button
                          disabled={isBusy}
                          onClick={() => postAhLine(m.id)}
                          className="bg-blue-600 text-white text-sm px-3 py-1 rounded disabled:opacity-50"
                        >
                          Post / Move
                        </button>
                      </div>

                      {/* AH Line action buttons */}
                      {m.line && (
                        <div className="flex gap-2">
                          {m.line.status === "active" && (
                            <button
                              disabled={isBusy}
                              onClick={() => lineAction(m.id, "ah", "suspend")}
                              className="border text-sm px-2 py-1 rounded text-yellow-700 border-yellow-300 disabled:opacity-50"
                            >
                              Suspend
                            </button>
                          )}
                          {m.line.status === "suspended" && (
                            <button
                              disabled={isBusy}
                              onClick={() => lineAction(m.id, "ah", "resume")}
                              className="border text-sm px-2 py-1 rounded text-green-700 border-green-300 disabled:opacity-50"
                            >
                              Resume
                            </button>
                          )}
                          {m.line.status !== "closed" && (
                            <button
                              disabled={isBusy}
                              onClick={() => lineAction(m.id, "ah", "close")}
                              className="border text-sm px-2 py-1 rounded text-gray-600 disabled:opacity-50"
                            >
                              Close
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* ── TOTALS (O/U) MARKET ── */}
                    <div className="mb-3 rounded border border-gray-100 bg-gray-50 p-2">
                      <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">
                        Totals (O/U)
                      </p>

                      {/* Current O/U line summary */}
                      {m.ouLine ? (
                        <div className="text-sm mb-2 text-gray-700">
                          Line: O/U {ball(m.ouLine.ballQ)} @{" "}
                          {price(m.ouLine.priceC)}
                          <span
                            className={`ml-2 px-1 rounded text-xs ${
                              m.ouLine.status === "active"
                                ? "bg-green-100 text-green-700"
                                : m.ouLine.status === "suspended"
                                  ? "bg-yellow-100 text-yellow-700"
                                  : "bg-gray-200 text-gray-600"
                            }`}
                          >
                            {m.ouLine.status}
                          </span>
                          <span className="ml-2 text-xs text-gray-400">
                            v{m.ouLine.version}
                          </span>
                        </div>
                      ) : (
                        <div className="text-sm mb-2 text-gray-400">
                          No line posted
                        </div>
                      )}

                      {/* O/U Post / move form */}
                      <div className="space-y-2 mb-3">
                        <div className="flex gap-2 items-center text-sm">
                          <label className="w-16 text-gray-600">Goals</label>
                          <button
                            className="border rounded px-2 py-0.5"
                            onClick={() =>
                              updateOuForm(m.id, {
                                ballQ: Math.max(1, ouF.ballQ - 1),
                              })
                            }
                          >
                            −
                          </button>
                          <span className="w-10 text-center">
                            {ball(ouF.ballQ)}
                          </span>
                          <button
                            className="border rounded px-2 py-0.5"
                            onClick={() =>
                              updateOuForm(m.id, {
                                ballQ: Math.min(40, ouF.ballQ + 1),
                              })
                            }
                          >
                            +
                          </button>
                        </div>
                        <div className="flex gap-2 items-center text-sm">
                          <label className="w-16 text-gray-600">Price</label>
                          <input
                            type="number"
                            step="0.01"
                            min="-1.00"
                            max="1.00"
                            className="border rounded px-2 py-0.5 w-24 text-sm"
                            value={ouF.priceCInput}
                            onChange={(e) =>
                              updateOuForm(m.id, {
                                priceCInput: e.target.value,
                              })
                            }
                          />
                        </div>
                        <button
                          disabled={isBusy}
                          onClick={() => postOuLine(m.id)}
                          className="bg-blue-600 text-white text-sm px-3 py-1 rounded disabled:opacity-50"
                        >
                          Post / Move
                        </button>
                      </div>

                      {/* O/U Line action buttons */}
                      {m.ouLine && (
                        <div className="flex gap-2">
                          {m.ouLine.status === "active" && (
                            <button
                              disabled={isBusy}
                              onClick={() => lineAction(m.id, "ou", "suspend")}
                              className="border text-sm px-2 py-1 rounded text-yellow-700 border-yellow-300 disabled:opacity-50"
                            >
                              Suspend
                            </button>
                          )}
                          {m.ouLine.status === "suspended" && (
                            <button
                              disabled={isBusy}
                              onClick={() => lineAction(m.id, "ou", "resume")}
                              className="border text-sm px-2 py-1 rounded text-green-700 border-green-300 disabled:opacity-50"
                            >
                              Resume
                            </button>
                          )}
                          {m.ouLine.status !== "closed" && (
                            <button
                              disabled={isBusy}
                              onClick={() => lineAction(m.id, "ou", "close")}
                              className="border text-sm px-2 py-1 rounded text-gray-600 disabled:opacity-50"
                            >
                              Close
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Per-match limit */}
                    <div className="flex gap-2 items-center text-sm border-t pt-2">
                      <label className="text-gray-600">Match limit (MMK)</label>
                      <input
                        type="number"
                        min="0"
                        step="1000"
                        className="border rounded px-2 py-0.5 w-32 text-sm"
                        placeholder="unlimited"
                        value={limits[m.id] ?? ""}
                        onChange={(e) =>
                          setLimits((prev) => ({
                            ...prev,
                            [m.id]: e.target.value,
                          }))
                        }
                      />
                      <button
                        disabled={isBusy}
                        onClick={() => saveLimit(m.id)}
                        className="border text-sm px-2 py-1 rounded disabled:opacity-50"
                      >
                        Save
                      </button>
                      {m.betLimitMmk != null && (
                        <span className="text-xs text-gray-500">
                          Current: {mmk(m.betLimitMmk)}
                        </span>
                      )}
                    </div>

                    {err && <p className="text-red-600 text-sm mt-1">{err}</p>}
                  </div>
                );
              })}
            </section>
          );
        })}
    </main>
  );
}
