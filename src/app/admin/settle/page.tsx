"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { mmk, signedMmk, ball, price, todayMmt } from "@/lib/client/format";
import { gradeDetail } from "@/lib/engine/grade";
import type { GradeInput } from "@/lib/engine/grade";

type TicketItem = {
  ticketNo: string;
  side: "fav" | "dog" | "over" | "under";
  stakeMmk: number;
  status: string;
  netMmk: number | null;
  settlementId: number | null;
  favSide: "home" | "away";
  ballQ: number;
  priceC: number;
  market: "ah" | "ou";
  homeTeam: string;
  awayTeam: string;
  scoreHomeAtBet: number;
  scoreAwayAtBet: number;
  finalHomeScore: number | null;
  finalAwayScore: number | null;
};

type PlayerRow = {
  playerId: number;
  displayName: string;
  netMmk: number;
  ticketCount: number;
  settled: number;
  tickets: TicketItem[];
};

type DayBoard = {
  day: {
    id: number;
    date: string;
    status: "open" | "closed" | "settled";
    closedAt: string | null;
  };
  rows: PlayerRow[];
  houseNet: number;
};

export default function SettlePage() {
  const [date, setDate] = useState(todayMmt);
  const [board, setBoard] = useState<DayBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");

  const reload = (d: string) =>
    api<DayBoard>(`/api/admin/settle?date=${d}`)
      .then((b) => {
        setBoard(b);
        setLoading(false);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Failed to load");
        setLoading(false);
      });

  useEffect(() => {
    void reload(date);
  }, [date]);

  function setBusyFor(key: string, val: boolean) {
    setBusy((prev) => ({ ...prev, [key]: val }));
  }

  async function markPaid(playerId: number) {
    const key = `pay-${playerId}`;
    setBusyFor(key, true);
    setError("");
    try {
      await api("/api/admin/settle", { action: "mark_paid", date, playerId });
      reload(date);
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
    } finally {
      setBusyFor(key, false);
    }
  }

  async function voidTicket(ticketNo: string) {
    const ok = window.confirm(`Void ticket ${ticketNo}?`);
    if (!ok) return;
    const reason = window.prompt("Void reason (required):") ?? "";
    if (!reason.trim()) return;
    const key = `void-${ticketNo}`;
    setBusyFor(key, true);
    setError("");
    try {
      await api("/api/admin/settle", { action: "void", ticketNo, reason });
      reload(date);
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
    } finally {
      setBusyFor(key, false);
    }
  }

  function toggleExpand(playerId: number) {
    setExpanded((prev) => ({ ...prev, [playerId]: !prev[playerId] }));
  }

  return (
    <main>
      <h1 className="mb-3 text-lg font-bold">Settle</h1>

      <div className="flex gap-2 items-center mb-4">
        <label className="text-sm text-gray-600">Date</label>
        <input
          type="date"
          className="border rounded px-2 py-1 text-sm"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

      {loading && <p className="text-gray-500">Loading…</p>}

      {!loading && board && (
        <>
          <div className="flex items-center gap-3 mb-4">
            <span
              className={`text-xs px-2 py-0.5 rounded font-semibold ${
                board.day.status === "settled"
                  ? "bg-green-100 text-green-700"
                  : board.day.status === "closed"
                    ? "bg-yellow-100 text-yellow-700"
                    : "bg-gray-100 text-gray-600"
              }`}
            >
              {board.day.status}
            </span>
            <span className="text-sm">
              House net:{" "}
              <span
                className={
                  board.houseNet >= 0
                    ? "text-green-700 font-bold"
                    : "text-red-600 font-bold"
                }
              >
                {signedMmk(board.houseNet)}
              </span>
            </span>
          </div>

          {board.rows.length > 0 && (
            <div className="text-sm text-gray-600 mb-3 flex flex-wrap gap-3">
              <span>
                Pay out:{" "}
                <span className="text-green-700 font-semibold">
                  {mmk(
                    board.rows
                      .filter((r) => r.netMmk > 0)
                      .reduce((s, r) => s + r.netMmk, 0),
                  )}{" "}
                  MMK
                </span>
              </span>
              <span className="text-gray-300">·</span>
              <span>
                Collect:{" "}
                <span className="text-red-600 font-semibold">
                  {mmk(
                    board.rows
                      .filter((r) => r.netMmk < 0)
                      .reduce((s, r) => s + Math.abs(r.netMmk), 0),
                  )}{" "}
                  MMK
                </span>
              </span>
            </div>
          )}

          {board.rows.length === 0 && (
            <p className="text-gray-500 text-sm">
              No graded tickets for this date.
            </p>
          )}

          {board.rows.map((row) => {
            const isExpanded = expanded[row.playerId] ?? false;
            const isSettled = row.settled === 1;
            const payKey = `pay-${row.playerId}`;
            // Direction by net sign: >0 house PAYS the player; <0 house COLLECTS.
            const dir =
              row.netMmk > 0 ? "pay" : row.netMmk < 0 ? "collect" : "even";
            const actionLabel =
              dir === "pay"
                ? "Mark Paid"
                : dir === "collect"
                  ? "Mark Collected"
                  : "Mark Settled";

            return (
              <div key={row.playerId} className="mb-4 rounded border">
                {/* Player header */}
                <div
                  className="flex items-center justify-between p-3 cursor-pointer"
                  onClick={() => toggleExpand(row.playerId)}
                >
                  <div>
                    <span className="font-semibold">{row.displayName}</span>
                    <span className="ml-2 text-xs text-gray-500">
                      {row.ticketCount} ticket{row.ticketCount !== 1 ? "s" : ""}
                    </span>
                    <span
                      className={
                        "ml-2 text-xs font-bold uppercase " +
                        (dir === "pay"
                          ? "text-mx"
                          : dir === "collect"
                            ? "text-ca"
                            : "text-gray-400")
                      }
                    >
                      {dir === "pay"
                        ? "Pay"
                        : dir === "collect"
                          ? "Receive"
                          : "Even"}
                    </span>
                    {isSettled && (
                      <span className="ml-2 text-xs bg-green-100 text-green-700 px-1 rounded">
                        settled
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={
                        row.netMmk >= 0
                          ? "text-green-700 font-semibold"
                          : "text-red-600 font-semibold"
                      }
                    >
                      {signedMmk(row.netMmk)}
                    </span>
                    <span className="text-gray-400 text-sm">
                      {isExpanded ? "▲" : "▼"}
                    </span>
                  </div>
                </div>

                {/* Expanded ticket list */}
                {isExpanded && (
                  <div className="border-t px-3 pb-3">
                    <div className="space-y-2 mt-2">
                      {row.tickets.map((t) => {
                        const fav =
                          t.favSide === "home" ? t.homeTeam : t.awayTeam;
                        const dog =
                          t.favSide === "home" ? t.awayTeam : t.homeTeam;
                        const label =
                          t.market === "ou"
                            ? t.side === "over"
                              ? `Over ${ball(t.ballQ)} @ ${price(t.priceC)}`
                              : `Under ${ball(t.ballQ)} @ ${price(t.priceC)}`
                            : t.side === "fav"
                              ? `${fav} −${ball(t.ballQ)} @ ${price(t.priceC)}`
                              : `${dog} +${ball(t.ballQ)} @ ${price(t.priceC)}`;
                        const voidKey = `void-${t.ticketNo}`;

                        // Compute breakdown using gradeDetail (same engine as grading)
                        let breakdown: React.ReactNode = null;
                        if (t.netMmk != null && t.status !== "void") {
                          const finalHome =
                            t.finalHomeScore ?? t.scoreHomeAtBet;
                          const finalAway =
                            t.finalAwayScore ?? t.scoreAwayAtBet;
                          const effHome = Math.max(
                            finalHome - t.scoreHomeAtBet,
                            0,
                          );
                          const effAway = Math.max(
                            finalAway - t.scoreAwayAtBet,
                            0,
                          );
                          const effFav =
                            t.favSide === "home" ? effHome : effAway;
                          const effDog =
                            t.favSide === "home" ? effAway : effHome;

                          try {
                            const d = gradeDetail({
                              market: t.market,
                              side: t.side,
                              ballQ: t.ballQ,
                              priceC: t.priceC,
                              stake: t.stakeMmk,
                              effFav,
                              effDog,
                            } as GradeInput);

                            const isLive =
                              t.scoreHomeAtBet !== 0 || t.scoreAwayAtBet !== 0;
                            const scoreLine = isLive
                              ? `Bet at ${t.scoreHomeAtBet}–${t.scoreAwayAtBet} · final ${finalHome}–${finalAway} · counts after-bet goals: ${effHome}–${effAway}`
                              : `Final ${finalHome}–${finalAway}`;

                            let mathLine: string;
                            if (t.market === "ah") {
                              const sign = t.side === "fav" ? "−" : "+";
                              const handicapGoals = ball(t.ballQ);
                              const teamLabel = t.side === "fav" ? fav : dog;
                              if (d.quarter) {
                                const p0 = d.parts[0];
                                const p1 = d.parts[1];
                                mathLine = `${teamLabel} ${sign}${handicapGoals} (${effFav}–${effDog}): ½ at ${p0.lineGoals} (${p0.outcome}) · ½ at ${p1.lineGoals} (${p1.outcome})`;
                              } else {
                                mathLine = `${teamLabel} ${sign}${handicapGoals}: effective margin ${effFav}–${effDog} vs ${ball(t.ballQ)} — ${d.parts[0].outcome}`;
                              }
                            } else {
                              const total = effFav + effDog;
                              const line = ball(t.ballQ);
                              if (d.quarter) {
                                const p0 = d.parts[0];
                                const p1 = d.parts[1];
                                mathLine = `Total ${total} vs ${line}: ½ at ${p0.lineGoals} (${p0.outcome}) · ½ at ${p1.lineGoals} (${p1.outcome})`;
                              } else {
                                mathLine = `Total ${total} vs ${line} — ${d.parts[0].outcome}`;
                              }
                            }

                            let resultLine: string;
                            const s = t.status;
                            if (s === "won") {
                              resultLine = `WON +${mmk(t.netMmk)} = ${mmk(t.stakeMmk)}×${price(t.priceC)}`;
                            } else if (s === "lost") {
                              resultLine = `LOST −${mmk(t.stakeMmk)}`;
                            } else if (s === "push") {
                              resultLine = `PUSH 0 (stake returned)`;
                            } else if (s === "half_won") {
                              const halfStake = t.stakeMmk / 2;
                              resultLine = `HALF WON ½×${mmk(halfStake)}×${price(t.priceC)} → ${signedMmk(t.netMmk)}`;
                            } else if (s === "half_lost") {
                              const halfStake = t.stakeMmk / 2;
                              const lossAmt =
                                t.priceC > 0
                                  ? halfStake
                                  : Math.round(
                                      (halfStake * Math.abs(t.priceC)) / 100,
                                    );
                              resultLine = `HALF LOST −${mmk(lossAmt)} → ${signedMmk(t.netMmk)}`;
                            } else {
                              resultLine = signedMmk(t.netMmk);
                            }

                            breakdown = (
                              <div className="text-xs text-gray-400 mt-1 space-y-0.5 font-mono">
                                <div>{scoreLine}</div>
                                <div>{mathLine}</div>
                                <div
                                  className={
                                    t.netMmk >= 0
                                      ? "text-green-600"
                                      : "text-red-500"
                                  }
                                >
                                  {resultLine}
                                </div>
                              </div>
                            );
                          } catch {
                            // gradeDetail throws on bad data; show nothing
                          }
                        } else if (t.status === "void") {
                          breakdown = (
                            <div className="text-xs text-gray-400 mt-1 italic">
                              Voided
                            </div>
                          );
                        }

                        return (
                          <div
                            key={t.ticketNo}
                            className="text-sm flex items-start justify-between gap-2 border-b last:border-0 pb-2"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="font-mono text-xs text-gray-500">
                                {t.ticketNo}
                              </div>
                              <div>{label}</div>
                              <div className="text-xs text-gray-500">
                                Stake: {mmk(t.stakeMmk)} · Net:{" "}
                                {t.netMmk != null
                                  ? signedMmk(t.netMmk)
                                  : "pending"}{" "}
                                · {t.status}
                              </div>
                              {breakdown}
                            </div>
                            <button
                              disabled={busy[voidKey] || t.settlementId != null}
                              onClick={() => voidTicket(t.ticketNo)}
                              className="border border-red-300 text-red-600 text-xs px-2 py-0.5 rounded shrink-0 disabled:opacity-40"
                            >
                              Void
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    <button
                      disabled={busy[payKey] || isSettled}
                      onClick={() => markPaid(row.playerId)}
                      className="mt-3 bg-green-600 text-white text-sm px-3 py-1 rounded disabled:opacity-50 w-full"
                    >
                      {isSettled ? "Settled" : actionLabel}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </main>
  );
}
