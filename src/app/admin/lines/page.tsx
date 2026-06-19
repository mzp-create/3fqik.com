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
  priceC: number; // primary side (fav/over)
  priceOppC: number | null; // opposite side (dog/under)
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

// Market-reference odds (from The Odds API) for a single match.
type RefItem = {
  matchId: number;
  bookmaker: string;
  ah: {
    favCode: string;
    line: number;
    favMalay: number;
    dogMalay: number;
  } | null;
  ou: { line: number; overMalay: number; underMalay: number } | null;
  h2h: { home: number; draw: number | null; away: number } | null;
};

/** Format a Malay price with an explicit sign: 0.92 → "+0.92", −0.91 → "−0.91". */
function fmtMalay(v: number): string {
  return (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(2);
}

type AhFormState = {
  favSide: "home" | "away";
  ballQ: number; // stored as quarter units (×4)
  priceCInput: string; // raw string for the favourite price input
  priceOppCInput: string; // raw string for the underdog price input
};

type OuFormState = {
  ballQ: number; // stored as quarter units (×4), min 1 (=0.25)
  priceCInput: string; // over price
  priceOppCInput: string; // under price
};

/** Flip the sign of a price string (the mobile numeric keypad has no minus). */
function flipSign(s: string): string {
  const t = s.trim();
  return t.startsWith("-") ? t.slice(1) : "-" + t;
}
const isNeg = (s: string) => s.trim().startsWith("-");
const magOf = (s: string) => s.replace(/^-/, "");

/** Parse a price input string to the stored signed ×100 int, or null if invalid. */
function parsePriceC(input: string): number | null {
  const parsed = parseFloat(input);
  if (isNaN(parsed) || parsed < -1 || parsed > 1) return null;
  const c = Math.round(parsed * 100);
  if (c === 0 || c < -100 || c > 100) return null;
  return c;
}

function initAhForm(line?: Line | null): AhFormState {
  if (line) {
    return {
      favSide: line.favSide,
      ballQ: line.ballQ,
      priceCInput: (line.priceC / 100).toFixed(2),
      priceOppCInput:
        line.priceOppC != null ? (line.priceOppC / 100).toFixed(2) : "-0.98",
    };
  }
  return {
    favSide: "home",
    ballQ: 4,
    priceCInput: "0.92",
    priceOppCInput: "-0.98",
  };
}

function initOuForm(line?: Line | null): OuFormState {
  if (line) {
    return {
      ballQ: line.ballQ,
      priceCInput: (line.priceC / 100).toFixed(2),
      priceOppCInput:
        line.priceOppC != null ? (line.priceOppC / 100).toFixed(2) : "-0.94",
    };
  }
  // default 2.5 goals = ballQ 10
  return { ballQ: 10, priceCInput: "0.90", priceOppCInput: "-0.94" };
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
  // Market-reference odds, keyed by matchId, loaded on demand.
  const [marketRef, setMarketRef] = useState<Record<number, RefItem>>({});
  const [refLoading, setRefLoading] = useState(false);
  const [refMsg, setRefMsg] = useState("");

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

  async function loadReference() {
    setRefLoading(true);
    setRefMsg("");
    try {
      const r = await api<{
        configured: boolean;
        error?: string;
        message?: string;
        fetchedAt?: string;
        remaining?: number | null;
        items: RefItem[];
      }>("/api/admin/odds/reference");
      const map: Record<number, RefItem> = {};
      for (const it of r.items) map[it.matchId] = it;
      setMarketRef(map);
      if (r.items.length > 0) {
        const book = r.items[0].bookmaker;
        const left = r.remaining != null ? ` · ${r.remaining} req left` : "";
        setRefMsg(
          `Market reference: ${r.items.length} match${r.items.length === 1 ? "" : "es"} (${book})${left}`,
        );
      } else {
        setRefMsg(r.message || "No reference odds available right now.");
      }
    } catch (e) {
      setRefMsg(e instanceof Error ? e.message : "Failed to load reference");
    } finally {
      setRefLoading(false);
    }
  }

  async function postAhLine(matchId: number) {
    const f = ahForms[matchId];
    if (!f) return;
    const priceC = parsePriceC(f.priceCInput);
    if (priceC == null) {
      setError(
        matchId,
        "Fav price must be a non-zero signed value −1.00…+1.00",
      );
      return;
    }
    const priceOppC = parsePriceC(f.priceOppCInput);
    if (priceOppC == null) {
      setError(
        matchId,
        "Dog price must be a non-zero signed value −1.00…+1.00",
      );
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
        priceOppC,
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
    const priceC = parsePriceC(f.priceCInput);
    if (priceC == null) {
      setError(
        matchId,
        "Over price must be a non-zero signed value −1.00…+1.00",
      );
      return;
    }
    const priceOppC = parsePriceC(f.priceOppCInput);
    if (priceOppC == null) {
      setError(
        matchId,
        "Under price must be a non-zero signed value −1.00…+1.00",
      );
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
        priceOppC,
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

  if (globalError) return <p className="text-ca">{globalError}</p>;

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
        <div className="flex gap-1 rounded-lg bg-raised p-0.5">
          <button
            onClick={() => setView("detailed")}
            className={`rounded-md px-3 py-1 text-sm font-semibold ${
              view === "detailed" ? "bg-surface shadow-sm" : "text-muted"
            }`}
          >
            Detailed
          </button>
          <button
            onClick={() => setView("grid")}
            className={`rounded-md px-3 py-1 text-sm font-semibold ${
              view === "grid" ? "bg-surface shadow-sm" : "text-muted"
            }`}
          >
            Grid
          </button>
        </div>
        <button
          onClick={loadReference}
          disabled={refLoading}
          className="ml-auto rounded bg-us px-3 py-1 text-sm font-semibold text-white disabled:opacity-50"
        >
          {refLoading ? "Loading…" : "Market ref"}
        </button>
        <button
          onClick={() => setShowAll((v) => !v)}
          className="text-xs border border-border px-2 py-1 rounded text-muted"
        >
          {showAll ? "Show relevant" : "Show all"}
        </button>
      </div>
      {refMsg && <p className="mb-3 text-sm text-us-neon">{refMsg}</p>}

      {visible.length === 0 && !showAll && (
        <p className="text-muted text-sm">
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
              <div className="sticky top-0 z-10 -mx-1 mb-3 flex items-center gap-2 border-b border-border bg-surface/95 px-1 py-1.5 backdrop-blur">
                <h2 className="text-base font-bold">{dl.formatted}</h2>
                {dl.tag && (
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
                      dl.tag === "Overdue"
                        ? "bg-ca/15 text-ca"
                        : dl.tag === "Today"
                          ? "bg-mx/15 text-mx-neon"
                          : "bg-raised text-muted"
                    }`}
                  >
                    {dl.tag}
                  </span>
                )}
                <span className="ml-auto text-xs text-faint">
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
                  <div
                    key={m.id}
                    className="mb-6 rounded border border-border bg-surface p-3"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold">
                        {m.homeTeam} vs {m.awayTeam}
                      </span>
                      <span
                        className={`text-xs px-1 rounded ${
                          m.status === "live"
                            ? "bg-mx/15 text-mx-neon"
                            : "bg-raised text-muted"
                        }`}
                      >
                        {m.status}
                      </span>
                    </div>

                    {/* Market reference (The Odds API) — banker price discovery */}
                    {marketRef[m.id] &&
                      (() => {
                        const r = marketRef[m.id];
                        return (
                          <div className="mb-3 rounded border border-us/30 bg-us/10 px-2 py-1.5 text-xs text-us-neon">
                            <span className="font-semibold uppercase tracking-wide text-us-neon">
                              Market · {r.bookmaker}
                            </span>
                            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                              {r.ah && (
                                <span>
                                  AH:{" "}
                                  <b>
                                    {r.ah.favCode} −{r.ah.line}
                                  </b>{" "}
                                  {fmtMalay(r.ah.favMalay)} / dog{" "}
                                  {fmtMalay(r.ah.dogMalay)}
                                </span>
                              )}
                              {r.ou && (
                                <span>
                                  O/U: <b>{r.ou.line}</b> O{" "}
                                  {fmtMalay(r.ou.overMalay)} / U{" "}
                                  {fmtMalay(r.ou.underMalay)}
                                </span>
                              )}
                              {r.h2h && (
                                <span className="text-us-neon">
                                  1X2: {r.h2h.home.toFixed(2)} /{" "}
                                  {r.h2h.draw != null
                                    ? r.h2h.draw.toFixed(2)
                                    : "—"}{" "}
                                  / {r.h2h.away.toFixed(2)}
                                </span>
                              )}
                              {!r.ah && !r.ou && (
                                <span className="text-faint">
                                  handicap/totals not offered
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })()}

                    {/* ── HANDICAP (AH) MARKET ── */}
                    <div className="mb-4 rounded border border-border bg-raised p-2">
                      <p className="text-xs font-bold uppercase tracking-wide text-muted mb-2">
                        Handicap (AH)
                      </p>

                      {/* Current AH line summary */}
                      {m.line ? (
                        <div className="text-sm mb-2 text-muted">
                          Line:{" "}
                          {m.line.favSide === "home" ? m.homeTeam : m.awayTeam}
                          {" −"}
                          {ball(m.line.ballQ)} @ {price(m.line.priceC)}
                          {" / dog "}
                          {m.line.priceOppC != null
                            ? price(m.line.priceOppC)
                            : "—"}
                          <span
                            className={`ml-2 px-1 rounded text-xs ${
                              m.line.status === "active"
                                ? "bg-mx/15 text-mx-neon"
                                : m.line.status === "suspended"
                                  ? "bg-gold/15 text-gold"
                                  : "bg-raised text-muted"
                            }`}
                          >
                            {m.line.status}
                          </span>
                          <span className="ml-2 text-xs text-faint">
                            v{m.line.version}
                          </span>
                        </div>
                      ) : (
                        <div className="text-sm mb-2 text-faint">
                          No line posted
                        </div>
                      )}

                      {/* AH Post / move form */}
                      <div className="space-y-2 mb-3">
                        <div className="flex gap-2 items-center text-sm">
                          <label className="w-16 text-muted">Fav side</label>
                          <select
                            className="border border-border bg-raised text-ink rounded px-1 py-0.5 text-sm"
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
                          <label className="w-16 text-muted">Ball</label>
                          <button
                            className="border border-border rounded px-2 py-0.5"
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
                            className="border border-border rounded px-2 py-0.5"
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
                          <label className="w-16 text-muted">Fav price</label>
                          <button
                            type="button"
                            className={`border rounded w-9 py-0.5 font-bold ${
                              isNeg(ahF.priceCInput)
                                ? "bg-ca/15 text-ca border-ca/40"
                                : "bg-mx/15 text-mx-neon border-mx/40"
                            }`}
                            onClick={() =>
                              updateAhForm(m.id, {
                                priceCInput: flipSign(ahF.priceCInput),
                              })
                            }
                          >
                            {isNeg(ahF.priceCInput) ? "−" : "+"}
                          </button>
                          <input
                            type="text"
                            inputMode="decimal"
                            placeholder="0.90"
                            className="border border-border bg-raised text-ink placeholder:text-faint rounded px-2 py-0.5 w-20 text-sm"
                            value={magOf(ahF.priceCInput)}
                            onChange={(e) => {
                              const mag = e.target.value.replace(
                                /[^0-9.]/g,
                                "",
                              );
                              updateAhForm(m.id, {
                                priceCInput:
                                  (isNeg(ahF.priceCInput) ? "-" : "") + mag,
                              });
                            }}
                          />
                          <span className="text-xs text-faint">
                            {ahF.favSide === "home" ? m.homeTeam : m.awayTeam}
                          </span>
                        </div>
                        <div className="flex gap-2 items-center text-sm">
                          <label className="w-16 text-muted">Dog price</label>
                          <button
                            type="button"
                            className={`border rounded w-9 py-0.5 font-bold ${
                              isNeg(ahF.priceOppCInput)
                                ? "bg-ca/15 text-ca border-ca/40"
                                : "bg-mx/15 text-mx-neon border-mx/40"
                            }`}
                            onClick={() =>
                              updateAhForm(m.id, {
                                priceOppCInput: flipSign(ahF.priceOppCInput),
                              })
                            }
                          >
                            {isNeg(ahF.priceOppCInput) ? "−" : "+"}
                          </button>
                          <input
                            type="text"
                            inputMode="decimal"
                            placeholder="0.98"
                            className="border border-border bg-raised text-ink placeholder:text-faint rounded px-2 py-0.5 w-20 text-sm"
                            value={magOf(ahF.priceOppCInput)}
                            onChange={(e) => {
                              const mag = e.target.value.replace(
                                /[^0-9.]/g,
                                "",
                              );
                              updateAhForm(m.id, {
                                priceOppCInput:
                                  (isNeg(ahF.priceOppCInput) ? "-" : "") + mag,
                              });
                            }}
                          />
                          <span className="text-xs text-faint">
                            {ahF.favSide === "home" ? m.awayTeam : m.homeTeam}
                          </span>
                        </div>
                        <button
                          disabled={isBusy}
                          onClick={() => postAhLine(m.id)}
                          className="bg-us text-white text-sm px-3 py-1 rounded disabled:opacity-50"
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
                              className="border text-sm px-2 py-1 rounded text-gold border-gold/40 disabled:opacity-50"
                            >
                              Suspend
                            </button>
                          )}
                          {m.line.status === "suspended" && (
                            <button
                              disabled={isBusy}
                              onClick={() => lineAction(m.id, "ah", "resume")}
                              className="border text-sm px-2 py-1 rounded text-mx-neon border-mx/40 disabled:opacity-50"
                            >
                              Resume
                            </button>
                          )}
                          {m.line.status !== "closed" && (
                            <button
                              disabled={isBusy}
                              onClick={() => lineAction(m.id, "ah", "close")}
                              className="border border-border text-sm px-2 py-1 rounded text-muted disabled:opacity-50"
                            >
                              Close
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* ── TOTALS (O/U) MARKET ── */}
                    <div className="mb-3 rounded border border-border bg-raised p-2">
                      <p className="text-xs font-bold uppercase tracking-wide text-muted mb-2">
                        Totals (O/U)
                      </p>

                      {/* Current O/U line summary */}
                      {m.ouLine ? (
                        <div className="text-sm mb-2 text-muted">
                          Line: O/U {ball(m.ouLine.ballQ)} @{" "}
                          {price(m.ouLine.priceC)}
                          {" / U "}
                          {m.ouLine.priceOppC != null
                            ? price(m.ouLine.priceOppC)
                            : "—"}
                          <span
                            className={`ml-2 px-1 rounded text-xs ${
                              m.ouLine.status === "active"
                                ? "bg-mx/15 text-mx-neon"
                                : m.ouLine.status === "suspended"
                                  ? "bg-gold/15 text-gold"
                                  : "bg-raised text-muted"
                            }`}
                          >
                            {m.ouLine.status}
                          </span>
                          <span className="ml-2 text-xs text-faint">
                            v{m.ouLine.version}
                          </span>
                        </div>
                      ) : (
                        <div className="text-sm mb-2 text-faint">
                          No line posted
                        </div>
                      )}

                      {/* O/U Post / move form */}
                      <div className="space-y-2 mb-3">
                        <div className="flex gap-2 items-center text-sm">
                          <label className="w-16 text-muted">Goals</label>
                          <button
                            className="border border-border rounded px-2 py-0.5"
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
                            className="border border-border rounded px-2 py-0.5"
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
                          <label className="w-16 text-muted">Over price</label>
                          <button
                            type="button"
                            className={`border rounded w-9 py-0.5 font-bold ${
                              isNeg(ouF.priceCInput)
                                ? "bg-ca/15 text-ca border-ca/40"
                                : "bg-mx/15 text-mx-neon border-mx/40"
                            }`}
                            onClick={() =>
                              updateOuForm(m.id, {
                                priceCInput: flipSign(ouF.priceCInput),
                              })
                            }
                          >
                            {isNeg(ouF.priceCInput) ? "−" : "+"}
                          </button>
                          <input
                            type="text"
                            inputMode="decimal"
                            placeholder="0.90"
                            className="border border-border bg-raised text-ink placeholder:text-faint rounded px-2 py-0.5 w-20 text-sm"
                            value={magOf(ouF.priceCInput)}
                            onChange={(e) => {
                              const mag = e.target.value.replace(
                                /[^0-9.]/g,
                                "",
                              );
                              updateOuForm(m.id, {
                                priceCInput:
                                  (isNeg(ouF.priceCInput) ? "-" : "") + mag,
                              });
                            }}
                          />
                        </div>
                        <div className="flex gap-2 items-center text-sm">
                          <label className="w-16 text-muted">Under price</label>
                          <button
                            type="button"
                            className={`border rounded w-9 py-0.5 font-bold ${
                              isNeg(ouF.priceOppCInput)
                                ? "bg-ca/15 text-ca border-ca/40"
                                : "bg-mx/15 text-mx-neon border-mx/40"
                            }`}
                            onClick={() =>
                              updateOuForm(m.id, {
                                priceOppCInput: flipSign(ouF.priceOppCInput),
                              })
                            }
                          >
                            {isNeg(ouF.priceOppCInput) ? "−" : "+"}
                          </button>
                          <input
                            type="text"
                            inputMode="decimal"
                            placeholder="0.94"
                            className="border border-border bg-raised text-ink placeholder:text-faint rounded px-2 py-0.5 w-20 text-sm"
                            value={magOf(ouF.priceOppCInput)}
                            onChange={(e) => {
                              const mag = e.target.value.replace(
                                /[^0-9.]/g,
                                "",
                              );
                              updateOuForm(m.id, {
                                priceOppCInput:
                                  (isNeg(ouF.priceOppCInput) ? "-" : "") + mag,
                              });
                            }}
                          />
                        </div>
                        <button
                          disabled={isBusy}
                          onClick={() => postOuLine(m.id)}
                          className="bg-us text-white text-sm px-3 py-1 rounded disabled:opacity-50"
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
                              className="border text-sm px-2 py-1 rounded text-gold border-gold/40 disabled:opacity-50"
                            >
                              Suspend
                            </button>
                          )}
                          {m.ouLine.status === "suspended" && (
                            <button
                              disabled={isBusy}
                              onClick={() => lineAction(m.id, "ou", "resume")}
                              className="border text-sm px-2 py-1 rounded text-mx-neon border-mx/40 disabled:opacity-50"
                            >
                              Resume
                            </button>
                          )}
                          {m.ouLine.status !== "closed" && (
                            <button
                              disabled={isBusy}
                              onClick={() => lineAction(m.id, "ou", "close")}
                              className="border border-border text-sm px-2 py-1 rounded text-muted disabled:opacity-50"
                            >
                              Close
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Per-match limit */}
                    <div className="flex gap-2 items-center text-sm border-t border-border pt-2">
                      <label className="text-muted">Match limit (MMK)</label>
                      <input
                        type="number"
                        min="0"
                        step="1000"
                        className="border border-border bg-raised text-ink placeholder:text-faint rounded px-2 py-0.5 w-32 text-sm"
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
                        className="border border-border text-sm px-2 py-1 rounded disabled:opacity-50"
                      >
                        Save
                      </button>
                      {m.betLimitMmk != null && (
                        <span className="text-xs text-muted">
                          Current: {mmk(m.betLimitMmk)}
                        </span>
                      )}
                    </div>

                    {err && <p className="text-ca text-sm mt-1">{err}</p>}
                  </div>
                );
              })}
            </section>
          );
        })}
    </main>
  );
}
