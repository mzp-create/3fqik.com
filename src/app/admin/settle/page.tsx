"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { mmk, signedMmk, todayMmt, pickLabel } from "@/lib/client/format";
import { teamName } from "@/lib/client/flags";
import { gradeBreakdown } from "@/lib/client/gradeBreakdown";

const PAYMENT_METHODS = [
  "Cash",
  "KBZ Pay",
  "Wave Money",
  "AYA Pay",
  "Bank Transfer",
];

type TicketItem = {
  ticketNo: string;
  side: "fav" | "dog" | "over" | "under";
  stakeMmk: number;
  status: string;
  netMmk: number | null;
  feeMmk: number | null;
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
  ref: string | null;
  paymentMethod: string | null;
  paymentReference: string | null;
  remark: string | null;
  tickets: TicketItem[];
};

type FeeSettings = {
  commissionPct: number;
  discountPct: number;
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
  feeSettings: FeeSettings;
};

type SettleForm = {
  paymentMethod: string;
  paymentReference: string;
  remark: string;
};

export default function SettlePage() {
  const [date, setDate] = useState(todayMmt);
  const [board, setBoard] = useState<DayBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  // inline settle form state: playerId -> form fields (null = form closed)
  const [settleForm, setSettleForm] = useState<
    Record<number, SettleForm | null>
  >({});

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

  function openSettleForm(playerId: number) {
    setSettleForm((prev) => ({
      ...prev,
      [playerId]: { paymentMethod: "", paymentReference: "", remark: "" },
    }));
  }

  function closeSettleForm(playerId: number) {
    setSettleForm((prev) => ({ ...prev, [playerId]: null }));
  }

  function updateSettleForm(
    playerId: number,
    field: keyof SettleForm,
    value: string,
  ) {
    setSettleForm((prev) => {
      const cur = prev[playerId];
      if (!cur) return prev;
      return { ...prev, [playerId]: { ...cur, [field]: value } };
    });
  }

  async function confirmSettle(playerId: number) {
    const form = settleForm[playerId];
    if (!form) return;
    const key = `pay-${playerId}`;
    setBusyFor(key, true);
    setError("");
    try {
      await api("/api/admin/settle", {
        action: "mark_paid",
        date,
        playerId,
        paymentMethod: form.paymentMethod,
        paymentReference: form.paymentReference,
        remark: form.remark,
      });
      closeSettleForm(playerId);
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
        <label className="text-sm text-muted">Date</label>
        <input
          type="date"
          className="bg-raised border-border rounded px-2 py-1 text-sm text-ink placeholder:text-faint"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      {error && <p className="text-ca text-sm mb-3">{error}</p>}

      {loading && <p className="text-muted">Loading…</p>}

      {!loading && board && (
        <>
          <div className="flex items-center gap-3 mb-4">
            <span
              className={`text-xs px-2 py-0.5 rounded font-semibold ${
                board.day.status === "settled"
                  ? "bg-mx/15 text-mx-neon"
                  : board.day.status === "closed"
                    ? "bg-gold/15 text-gold"
                    : "bg-raised text-muted"
              }`}
            >
              {board.day.status}
            </span>
            <span className="text-sm">
              House net:{" "}
              <span
                className={
                  board.houseNet >= 0
                    ? "text-mx-neon font-bold"
                    : "text-ca font-bold"
                }
              >
                {signedMmk(board.houseNet)}
              </span>
            </span>
            {board.feeSettings && (
              <span className="text-xs text-faint">
                commission {board.feeSettings.commissionPct}% · discount{" "}
                {board.feeSettings.discountPct}%
              </span>
            )}
          </div>

          {board.rows.length > 0 && (
            <div className="text-sm text-muted mb-3 flex flex-wrap gap-3">
              <span>
                Pay out:{" "}
                <span className="text-mx-neon font-semibold">
                  {mmk(
                    board.rows
                      .filter((r) => r.netMmk > 0)
                      .reduce((s, r) => s + r.netMmk, 0),
                  )}{" "}
                  MMK
                </span>
              </span>
              <span className="text-faint">·</span>
              <span>
                Collect:{" "}
                <span className="text-ca font-semibold">
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
            <p className="text-muted text-sm">
              No graded tickets for this date.
            </p>
          )}

          {board.rows.map((row) => {
            const isExpanded = expanded[row.playerId] ?? false;
            const isSettled = row.settled === 1;
            const payKey = `pay-${row.playerId}`;
            const isBusy = busy[payKey] ?? false;
            const form = settleForm[row.playerId] ?? null;
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
              <div
                key={row.playerId}
                className="mb-4 rounded border border-border"
              >
                {/* Player header */}
                <div
                  className="flex items-center justify-between p-3 cursor-pointer"
                  onClick={() => toggleExpand(row.playerId)}
                >
                  <div>
                    <span className="font-semibold">{row.displayName}</span>
                    <span className="ml-2 text-xs text-muted">
                      {row.ticketCount} ticket{row.ticketCount !== 1 ? "s" : ""}
                    </span>
                    <span
                      className={
                        "ml-2 text-xs font-bold uppercase " +
                        (dir === "pay"
                          ? "text-mx"
                          : dir === "collect"
                            ? "text-ca"
                            : "text-faint")
                      }
                    >
                      {dir === "pay"
                        ? "Pay"
                        : dir === "collect"
                          ? "Receive"
                          : "Even"}
                    </span>
                    {isSettled && (
                      <span className="ml-2 text-xs bg-mx/15 text-mx-neon px-1 rounded">
                        settled
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={
                        row.netMmk >= 0
                          ? "text-mx-neon font-semibold"
                          : "text-ca font-semibold"
                      }
                    >
                      {signedMmk(row.netMmk)}
                    </span>
                    <span className="text-faint text-sm">
                      {isExpanded ? "▲" : "▼"}
                    </span>
                  </div>
                </div>

                {/* Expanded ticket list */}
                {isExpanded && (
                  <div className="border-t border-border px-3 pb-3">
                    <div className="space-y-2 mt-2">
                      {row.tickets.map((t) => {
                        const fav =
                          t.favSide === "home" ? t.homeTeam : t.awayTeam;
                        const dog =
                          t.favSide === "home" ? t.awayTeam : t.homeTeam;
                        const pickedTeam =
                          t.market === "ah"
                            ? t.side === "fav"
                              ? fav
                              : dog
                            : null;
                        const label = pickLabel(
                          {
                            favSide: t.favSide,
                            ballQ: t.ballQ,
                            priceC: t.priceC,
                            market: t.market,
                          },
                          { homeTeam: t.homeTeam, awayTeam: t.awayTeam },
                          t.side,
                        );
                        const voidKey = `void-${t.ticketNo}`;

                        // Settlement breakdown (shared Malay engine) + fee lines
                        let breakdown: React.ReactNode = null;
                        if (t.netMmk != null && t.status !== "void") {
                          const bk = gradeBreakdown({
                            market: t.market,
                            side: t.side,
                            ballQ: t.ballQ,
                            priceC: t.priceC,
                            stakeMmk: t.stakeMmk,
                            favSide: t.favSide,
                            homeTeam: t.homeTeam,
                            awayTeam: t.awayTeam,
                            scoreHomeAtBet: t.scoreHomeAtBet,
                            scoreAwayAtBet: t.scoreAwayAtBet,
                            finalHome: t.finalHomeScore ?? t.scoreHomeAtBet,
                            finalAway: t.finalAwayScore ?? t.scoreAwayAtBet,
                          });
                          if (bk) {
                            const fee = t.feeMmk ?? 0;
                            const feeLine =
                              fee !== 0 && board.feeSettings ? (
                                fee < 0 ? (
                                  <div className="text-gold">
                                    Commission −{mmk(Math.abs(fee))} (
                                    {board.feeSettings.commissionPct}%)
                                  </div>
                                ) : (
                                  <div className="text-us-neon">
                                    Discount +{mmk(fee)} (
                                    {board.feeSettings.discountPct}%)
                                  </div>
                                )
                              ) : null;
                            const netAfterFee =
                              fee !== 0 ? (
                                <div
                                  className={
                                    t.netMmk + fee >= 0
                                      ? "text-mx-neon font-semibold"
                                      : "text-ca font-semibold"
                                  }
                                >
                                  Net after fee: {signedMmk(t.netMmk + fee)}
                                </div>
                              ) : null;
                            breakdown = (
                              <div className="text-xs text-faint mt-1 space-y-0.5 font-mono">
                                <div>{bk.scoreLine}</div>
                                <div>{bk.mathLine}</div>
                                <div
                                  className={
                                    bk.net >= 0 ? "text-mx-neon" : "text-ca"
                                  }
                                >
                                  {bk.resultLine}
                                </div>
                                {feeLine}
                                {netAfterFee}
                              </div>
                            );
                          }
                        } else if (t.status === "void") {
                          breakdown = (
                            <div className="text-xs text-faint mt-1 italic">
                              Voided
                            </div>
                          );
                        }

                        return (
                          <div
                            key={t.ticketNo}
                            className="text-sm flex items-start justify-between gap-2 border-b border-border last:border-0 pb-2"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="font-mono text-xs text-muted">
                                {t.ticketNo}
                              </div>
                              <div className="text-sm">
                                <span
                                  className={
                                    pickedTeam === t.homeTeam
                                      ? "font-semibold"
                                      : ""
                                  }
                                >
                                  {teamName(t.homeTeam)}
                                </span>
                                <span className="text-faint"> v </span>
                                <span
                                  className={
                                    pickedTeam === t.awayTeam
                                      ? "font-semibold"
                                      : ""
                                  }
                                >
                                  {teamName(t.awayTeam)}
                                </span>
                              </div>
                              <div className="text-muted">{label}</div>
                              <div className="text-xs text-muted">
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
                              className="border border-ca text-ca text-xs px-2 py-0.5 rounded shrink-0 disabled:opacity-40"
                            >
                              Void
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    {/* Settlement area */}
                    {isSettled ? (
                      /* Read-only settled payment detail */
                      <div className="mt-3 rounded bg-mx/15 border border-mx/30 px-3 py-2 text-sm space-y-0.5">
                        <div className="text-mx-neon font-semibold text-xs uppercase tracking-wide mb-1">
                          Settled · {row.ref}
                        </div>
                        {row.paymentMethod && (
                          <div className="text-ink">
                            <span className="text-muted text-xs">
                              Payment method:
                            </span>{" "}
                            {row.paymentMethod}
                          </div>
                        )}
                        {row.paymentReference && (
                          <div className="text-ink">
                            <span className="text-muted text-xs">Ref:</span>{" "}
                            <span className="font-mono">
                              {row.paymentReference}
                            </span>
                          </div>
                        )}
                        {row.remark && (
                          <div className="text-ink">
                            <span className="text-muted text-xs">Remark:</span>{" "}
                            {row.remark}
                          </div>
                        )}
                        {!row.paymentMethod &&
                          !row.paymentReference &&
                          !row.remark && (
                            <div className="text-faint text-xs italic">
                              No payment details recorded.
                            </div>
                          )}
                      </div>
                    ) : form ? (
                      /* Inline settle form */
                      <div className="mt-3 rounded border border-border bg-raised px-3 py-3 space-y-3">
                        <div className="text-sm font-semibold text-ink">
                          Record payment for {row.displayName}
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-muted mb-1">
                            Payment method
                          </label>
                          <input
                            list={`pm-list-${row.playerId}`}
                            value={form.paymentMethod}
                            onChange={(e) =>
                              updateSettleForm(
                                row.playerId,
                                "paymentMethod",
                                e.target.value,
                              )
                            }
                            placeholder="e.g. Cash"
                            className="w-full bg-raised border-border rounded px-2 py-1.5 text-sm text-ink placeholder:text-faint focus:outline-none focus:ring-1 focus:ring-us"
                          />
                          <datalist id={`pm-list-${row.playerId}`}>
                            {PAYMENT_METHODS.map((m) => (
                              <option key={m} value={m} />
                            ))}
                          </datalist>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-muted mb-1">
                            Reference{" "}
                            <span className="font-normal text-faint">
                              (external payment ref, optional)
                            </span>
                          </label>
                          <input
                            type="text"
                            value={form.paymentReference}
                            onChange={(e) =>
                              updateSettleForm(
                                row.playerId,
                                "paymentReference",
                                e.target.value,
                              )
                            }
                            placeholder="e.g. TXN123456"
                            className="w-full bg-raised border-border rounded px-2 py-1.5 text-sm text-ink placeholder:text-faint focus:outline-none focus:ring-1 focus:ring-us"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-muted mb-1">
                            Remark{" "}
                            <span className="font-normal text-faint">
                              (optional)
                            </span>
                          </label>
                          <input
                            type="text"
                            value={form.remark}
                            onChange={(e) =>
                              updateSettleForm(
                                row.playerId,
                                "remark",
                                e.target.value,
                              )
                            }
                            placeholder="e.g. Paid in person"
                            className="w-full bg-raised border-border rounded px-2 py-1.5 text-sm text-ink placeholder:text-faint focus:outline-none focus:ring-1 focus:ring-us"
                          />
                        </div>

                        <div className="flex gap-2 pt-1">
                          <button
                            disabled={isBusy}
                            onClick={() => confirmSettle(row.playerId)}
                            className="flex-1 bg-mx text-white text-sm font-semibold px-4 py-2 rounded disabled:opacity-50 hover:bg-mx/90 active:bg-mx/80"
                          >
                            {isBusy ? "Settling…" : `Confirm ${actionLabel}`}
                          </button>
                          <button
                            disabled={isBusy}
                            onClick={() => closeSettleForm(row.playerId)}
                            className="px-4 py-2 text-sm rounded border border-border bg-raised text-ink hover:bg-surface-2 disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Settle trigger button */
                      <button
                        disabled={isBusy}
                        onClick={() => openSettleForm(row.playerId)}
                        className="mt-3 bg-mx text-white text-sm font-semibold px-3 py-2 rounded disabled:opacity-50 w-full hover:bg-mx/90 active:bg-mx/80"
                      >
                        {actionLabel}
                      </button>
                    )}
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
