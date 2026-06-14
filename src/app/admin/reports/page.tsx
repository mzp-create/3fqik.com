"use client";
import { useEffect, useState } from "react";
import { mmk, signedMmk, todayMmt, ball, price } from "@/lib/client/format";
import { api } from "@/lib/client/api";

// ─── CSV helper ─────────────────────────────────────────────────────────────

function toCsv(headers: string[], rows: (string | number)[][]): string {
  const escape = (v: string | number) => {
    const s = String(v);
    if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.map(escape).join(",")];
  for (const row of rows) lines.push(row.map(escape).join(","));
  return lines.join("\r\n");
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Types ───────────────────────────────────────────────────────────────────

type PlayerOption = { id: number; displayName: string };

type BetRow = {
  ticketNo: string;
  matchDay: string;
  homeTeam: string;
  awayTeam: string;
  market: string;
  side: string;
  favSide: string;
  ballQ: number;
  priceC: number;
  stakeMmk: number;
  status: string;
  grossNet: number;
  fee: number;
  net: number;
  placedAt: string;
  settlementRef: string | null;
};

type SettlementRow = {
  ref: string;
  matchDay: string;
  netMmk: number;
  markedAt: string;
  paymentMethod: string | null;
  paymentReference: string | null;
  remark: string | null;
};

type PlayerSummary = {
  totalGross: number;
  totalFee: number;
  totalNet: number;
  settledNet: number;
  unsettledNet: number;
};

type PlayerReport = {
  bets: BetRow[];
  settlements: SettlementRow[];
  summary: PlayerSummary;
};

type DailyRow = {
  matchDay: string;
  playerId: number;
  playerName: string;
  net: number;
  ticketCount: number;
  settled: boolean;
  ref: string | null;
  paymentMethod: string | null;
  paymentReference: string | null;
  remark: string | null;
};

type DayTotal = {
  matchDay: string;
  houseNet: number;
  playerNetSum: number;
};

type DailyReport = {
  rows: DailyRow[];
  dayTotals: DayTotal[];
  grandTotal: { net: number; houseNet: number; ticketCount: number };
};

type PnlReport = {
  turnover: number;
  grossWin: number;
  grossLoss: number;
  commission: number;
  discount: number;
  playerNet: number;
  houseNet: number;
  betCount: number;
  players: number;
};

type BalanceRow = {
  playerId: number;
  playerName: string;
  unsettledNet: number;
  settledNet: number;
};

type BalancesReport = {
  rows: BalanceRow[];
  totals: { totalToPay: number; totalToCollect: number; totalSettled: number };
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function netColor(n: number) {
  if (n > 0) return "text-green-700 font-semibold";
  if (n < 0) return "text-red-600 font-semibold";
  return "text-gray-500";
}

function NetCell({ n }: { n: number }) {
  return <span className={netColor(n)}>{signedMmk(n)}</span>;
}

function defaultFrom() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

function betLabel(b: BetRow) {
  const fav = b.favSide === "home" ? b.homeTeam : b.awayTeam;
  const dog = b.favSide === "home" ? b.awayTeam : b.homeTeam;
  if (b.market === "ou") {
    return b.side === "over"
      ? `Over ${ball(b.ballQ)} @ ${price(b.priceC)}`
      : `Under ${ball(b.ballQ)} @ ${price(b.priceC)}`;
  }
  return b.side === "fav"
    ? `${fav} −${ball(b.ballQ)} @ ${price(b.priceC)}`
    : `${dog} +${ball(b.ballQ)} @ ${price(b.priceC)}`;
}

// ─── Tabs ────────────────────────────────────────────────────────────────────

type Tab = "player" | "daily" | "pnl" | "balances";
const TABS: { id: Tab; label: string }[] = [
  { id: "player", label: "Player Statement" },
  { id: "daily", label: "Daily Summary" },
  { id: "pnl", label: "House P&L" },
  { id: "balances", label: "Balances" },
];

// ─── Main page ───────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>("player");
  const today = todayMmt();
  const [from, setFrom] = useState(defaultFrom());
  const [to, setTo] = useState(today);
  const [players, setPlayers] = useState<PlayerOption[]>([]);
  const [playerId, setPlayerId] = useState<number | "">("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [playerReport, setPlayerReport] = useState<PlayerReport | null>(null);
  const [dailyReport, setDailyReport] = useState<DailyReport | null>(null);
  const [pnlReport, setPnlReport] = useState<PnlReport | null>(null);
  const [balancesReport, setBalancesReport] = useState<BalancesReport | null>(
    null,
  );

  // Load player list once
  useEffect(() => {
    api<PlayerOption[]>("/api/admin/players")
      .then((rows) =>
        setPlayers(
          rows
            .filter((p) => (p as unknown as { role: string }).role !== "admin")
            .sort((a, b) => a.displayName.localeCompare(b.displayName)),
        ),
      )
      .catch(() => {});
  }, []);

  async function runReport() {
    setError("");
    setLoading(true);
    setPlayerReport(null);
    setDailyReport(null);
    setPnlReport(null);
    setBalancesReport(null);
    try {
      if (tab === "player") {
        if (!playerId) {
          setError("Select a player");
          setLoading(false);
          return;
        }
        const data = await api<PlayerReport>(
          `/api/admin/reports/player?playerId=${playerId}&from=${from}&to=${to}`,
        );
        setPlayerReport(data);
      } else if (tab === "daily") {
        const data = await api<DailyReport>(
          `/api/admin/reports/daily?from=${from}&to=${to}`,
        );
        setDailyReport(data);
      } else if (tab === "pnl") {
        const data = await api<PnlReport>(
          `/api/admin/reports/pnl?from=${from}&to=${to}`,
        );
        setPnlReport(data);
      } else {
        const data = await api<BalancesReport>("/api/admin/reports/balances");
        setBalancesReport(data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  // ─── CSV downloads ──────────────────────────────────────────────────────

  function downloadPlayerCsv() {
    if (!playerReport) return;
    const playerName =
      players.find((p) => p.id === playerId)?.displayName ?? String(playerId);
    const headers = [
      "Ticket",
      "Match Day",
      "Home",
      "Away",
      "Market",
      "Side",
      "Stake",
      "Status",
      "Gross Net",
      "Fee",
      "Net",
      "Placed At",
      "Settlement Ref",
    ];
    const rows = playerReport.bets.map((b) => [
      b.ticketNo,
      b.matchDay,
      b.homeTeam,
      b.awayTeam,
      b.market,
      betLabel(b),
      b.stakeMmk,
      b.status,
      b.grossNet,
      b.fee,
      b.net,
      b.placedAt,
      b.settlementRef ?? "",
    ]);
    downloadCsv(
      `player-statement-${playerName}-${from}_${to}.csv`,
      toCsv(headers, rows),
    );
  }

  function downloadPlayerSettlementsCsv() {
    if (!playerReport) return;
    const playerName =
      players.find((p) => p.id === playerId)?.displayName ?? String(playerId);
    const headers = [
      "Ref",
      "Match Day",
      "Net MMK",
      "Marked At",
      "Payment Method",
      "Payment Reference",
      "Remark",
    ];
    const rows = playerReport.settlements.map((s) => [
      s.ref,
      s.matchDay,
      s.netMmk,
      s.markedAt,
      s.paymentMethod ?? "",
      s.paymentReference ?? "",
      s.remark ?? "",
    ]);
    downloadCsv(
      `player-settlements-${playerName}-${from}_${to}.csv`,
      toCsv(headers, rows),
    );
  }

  function downloadDailyCsv() {
    if (!dailyReport) return;
    const headers = [
      "Match Day",
      "Player",
      "Tickets",
      "Effective Net",
      "Settled",
      "Settlement Ref",
      "Payment Method",
      "Payment Reference",
      "Remark",
    ];
    const rows = dailyReport.rows.map((r) => [
      r.matchDay,
      r.playerName,
      r.ticketCount,
      r.net,
      r.settled ? "Y" : "N",
      r.ref ?? "",
      r.paymentMethod ?? "",
      r.paymentReference ?? "",
      r.remark ?? "",
    ]);
    downloadCsv(`daily-summary-${from}_${to}.csv`, toCsv(headers, rows));
  }

  function downloadPnlCsv() {
    if (!pnlReport) return;
    const headers = [
      "Turnover",
      "Gross Win",
      "Gross Loss",
      "Commission",
      "Discount",
      "Player Net",
      "House Net",
      "Bet Count",
      "Players",
    ];
    const rows = [
      [
        pnlReport.turnover,
        pnlReport.grossWin,
        pnlReport.grossLoss,
        pnlReport.commission,
        pnlReport.discount,
        pnlReport.playerNet,
        pnlReport.houseNet,
        pnlReport.betCount,
        pnlReport.players,
      ],
    ];
    downloadCsv(`house-pnl-${from}_${to}.csv`, toCsv(headers, rows));
  }

  function downloadBalancesCsv() {
    if (!balancesReport) return;
    const headers = [
      "Player",
      "Unsettled Net",
      "To Pay / Collect",
      "Settled Total",
    ];
    const rows = balancesReport.rows.map((r) => [
      r.playerName,
      r.unsettledNet,
      r.unsettledNet > 0 ? "Pay" : r.unsettledNet < 0 ? "Collect" : "Even",
      r.settledNet,
    ]);
    downloadCsv("balances.csv", toCsv(headers, rows));
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <main>
      <h1 className="mb-3 text-lg font-bold">Reports</h1>

      {/* Tab selector */}
      <div className="flex flex-wrap gap-2 mb-4">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setTab(t.id);
              setError("");
            }}
            className={`px-3 py-1 rounded text-sm font-medium border ${
              tab === t.id
                ? "bg-ink text-white border-ink"
                : "border-gray-300 text-gray-600 hover:border-gray-500"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end mb-4">
        {tab === "player" && (
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Player</label>
            <select
              className="border rounded px-2 py-1 text-sm"
              value={playerId}
              onChange={(e) =>
                setPlayerId(e.target.value ? parseInt(e.target.value, 10) : "")
              }
            >
              <option value="">— select —</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName}
                </option>
              ))}
            </select>
          </div>
        )}

        {tab !== "balances" && (
          <>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">From</label>
              <input
                type="date"
                className="border rounded px-2 py-1 text-sm"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">To</label>
              <input
                type="date"
                className="border rounded px-2 py-1 text-sm"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </>
        )}

        <button
          onClick={runReport}
          disabled={loading}
          className="bg-ink text-white text-sm px-4 py-1.5 rounded disabled:opacity-50"
        >
          {loading ? "Loading…" : "Run"}
        </button>
      </div>

      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

      {/* ── Player Statement ── */}
      {tab === "player" && playerReport && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 gap-2 mb-4 text-sm">
            {(
              [
                ["Total Gross", playerReport.summary.totalGross],
                ["Total Fee", playerReport.summary.totalFee],
                ["Total Net (eff)", playerReport.summary.totalNet],
                ["Settled", playerReport.summary.settledNet],
                ["Unsettled", playerReport.summary.unsettledNet],
              ] as [string, number][]
            ).map(([label, val]) => (
              <div key={label} className="border rounded px-3 py-2">
                <div className="text-xs text-gray-500">{label}</div>
                <div className={netColor(val)}>{signedMmk(val)}</div>
              </div>
            ))}
          </div>

          <div className="flex justify-between items-center mb-2">
            <h2 className="font-semibold text-sm">
              Bets ({playerReport.bets.length})
            </h2>
            <button
              onClick={downloadPlayerCsv}
              className="text-xs border rounded px-2 py-0.5 text-gray-600 hover:text-gray-900"
            >
              Download CSV
            </button>
          </div>

          <div className="overflow-x-auto text-xs">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-1 pr-2">Ticket</th>
                  <th className="py-1 pr-2">Day</th>
                  <th className="py-1 pr-2">Match</th>
                  <th className="py-1 pr-2">Pick</th>
                  <th className="py-1 pr-2 text-right">Stake</th>
                  <th className="py-1 pr-2">Status</th>
                  <th className="py-1 pr-2 text-right">Gross</th>
                  <th className="py-1 pr-2 text-right">Fee</th>
                  <th className="py-1 pr-2 text-right">Net</th>
                  <th className="py-1 pr-2">Ref</th>
                </tr>
              </thead>
              <tbody>
                {playerReport.bets.map((b) => (
                  <tr key={b.ticketNo} className="border-b last:border-0">
                    <td className="py-1 pr-2 font-mono">{b.ticketNo}</td>
                    <td className="py-1 pr-2">{b.matchDay}</td>
                    <td className="py-1 pr-2">
                      {b.homeTeam} v {b.awayTeam}
                    </td>
                    <td className="py-1 pr-2">{betLabel(b)}</td>
                    <td className="py-1 pr-2 text-right">{mmk(b.stakeMmk)}</td>
                    <td className="py-1 pr-2">{b.status}</td>
                    <td className="py-1 pr-2 text-right">
                      <NetCell n={b.grossNet} />
                    </td>
                    <td className="py-1 pr-2 text-right">
                      {b.fee !== 0 ? (
                        <span
                          className={
                            b.fee < 0 ? "text-orange-600" : "text-blue-600"
                          }
                        >
                          {signedMmk(b.fee)}
                        </span>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </td>
                    <td className="py-1 pr-2 text-right">
                      <NetCell n={b.net} />
                    </td>
                    <td className="py-1 pr-2 text-gray-500">
                      {b.settlementRef ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {playerReport.settlements.length > 0 && (
            <>
              <div className="flex justify-between items-center mt-4 mb-2">
                <h2 className="font-semibold text-sm">Settlements</h2>
                <button
                  onClick={downloadPlayerSettlementsCsv}
                  className="text-xs border rounded px-2 py-0.5 text-gray-600 hover:text-gray-900"
                >
                  Download CSV
                </button>
              </div>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="py-1 pr-2">Ref</th>
                    <th className="py-1 pr-2">Match Day</th>
                    <th className="py-1 pr-2 text-right">Net MMK</th>
                    <th className="py-1 pr-2">Marked At</th>
                    <th className="py-1 pr-2">Payment Method</th>
                    <th className="py-1 pr-2">Payment Ref</th>
                    <th className="py-1 pr-2">Remark</th>
                  </tr>
                </thead>
                <tbody>
                  {playerReport.settlements.map((s) => (
                    <tr key={s.ref} className="border-b last:border-0">
                      <td className="py-1 pr-2 font-mono">{s.ref}</td>
                      <td className="py-1 pr-2">{s.matchDay}</td>
                      <td className="py-1 pr-2 text-right">
                        <NetCell n={s.netMmk} />
                      </td>
                      <td className="py-1 pr-2 text-gray-500">{s.markedAt}</td>
                      <td className="py-1 pr-2">{s.paymentMethod ?? "—"}</td>
                      <td className="py-1 pr-2 font-mono">
                        {s.paymentReference ?? "—"}
                      </td>
                      <td className="py-1 pr-2 text-gray-600">
                        {s.remark ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </>
      )}

      {/* ── Daily Summary ── */}
      {tab === "daily" && dailyReport && (
        <>
          <div className="flex justify-between items-center mb-2">
            <h2 className="font-semibold text-sm">
              Daily Summary ({dailyReport.rows.length} rows)
            </h2>
            <button
              onClick={downloadDailyCsv}
              className="text-xs border rounded px-2 py-0.5 text-gray-600 hover:text-gray-900"
            >
              Download CSV
            </button>
          </div>

          <div className="overflow-x-auto text-xs">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-1 pr-2">Day</th>
                  <th className="py-1 pr-2">Player</th>
                  <th className="py-1 pr-2 text-right">Tickets</th>
                  <th className="py-1 pr-2 text-right">Eff Net</th>
                  <th className="py-1 pr-2">Settled</th>
                  <th className="py-1 pr-2">Ref</th>
                  <th className="py-1 pr-2">Payment Method</th>
                  <th className="py-1 pr-2">Payment Ref</th>
                  <th className="py-1 pr-2">Remark</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  // Group rows by day, interleaving day-total rows
                  const days = Array.from(
                    new Set(dailyReport.rows.map((r) => r.matchDay)),
                  );
                  const dayTotalMap = new Map(
                    dailyReport.dayTotals.map((d) => [d.matchDay, d]),
                  );
                  return days.flatMap((day) => {
                    const dayRows = dailyReport.rows.filter(
                      (r) => r.matchDay === day,
                    );
                    const dt = dayTotalMap.get(day);
                    return [
                      ...dayRows.map((r) => (
                        <tr
                          key={`${r.matchDay}-${r.playerId}`}
                          className="border-b"
                        >
                          <td className="py-1 pr-2">{r.matchDay}</td>
                          <td className="py-1 pr-2">{r.playerName}</td>
                          <td className="py-1 pr-2 text-right">
                            {r.ticketCount}
                          </td>
                          <td className="py-1 pr-2 text-right">
                            <NetCell n={r.net} />
                          </td>
                          <td className="py-1 pr-2">
                            {r.settled ? (
                              <span className="text-green-600">Y</span>
                            ) : (
                              <span className="text-gray-400">N</span>
                            )}
                          </td>
                          <td className="py-1 pr-2 text-gray-500">
                            {r.ref ?? "—"}
                          </td>
                          <td className="py-1 pr-2">
                            {r.paymentMethod ?? "—"}
                          </td>
                          <td className="py-1 pr-2 font-mono">
                            {r.paymentReference ?? "—"}
                          </td>
                          <td className="py-1 pr-2 text-gray-600">
                            {r.remark ?? "—"}
                          </td>
                        </tr>
                      )),
                      dt ? (
                        <tr
                          key={`total-${day}`}
                          className="bg-gray-50 font-semibold border-b-2"
                        >
                          <td className="py-1 pr-2">{day}</td>
                          <td className="py-1 pr-2 text-gray-500 italic">
                            House position
                          </td>
                          <td className="py-1 pr-2" />
                          <td className="py-1 pr-2 text-right">
                            <NetCell n={dt.houseNet} />
                          </td>
                          <td colSpan={5} />
                        </tr>
                      ) : null,
                    ];
                  });
                })()}
              </tbody>
              <tfoot>
                <tr className="bg-gray-100 font-bold">
                  <td colSpan={2} className="py-1 pr-2">
                    Grand Total
                  </td>
                  <td className="py-1 pr-2 text-right">
                    {dailyReport.grandTotal.ticketCount}
                  </td>
                  <td className="py-1 pr-2 text-right">
                    <NetCell n={dailyReport.grandTotal.net} />
                  </td>
                  <td colSpan={5} />
                </tr>
                <tr className="bg-gray-100 font-bold">
                  <td colSpan={2} className="py-1 pr-2 text-gray-500 italic">
                    House Grand Total
                  </td>
                  <td />
                  <td className="py-1 pr-2 text-right">
                    <NetCell n={dailyReport.grandTotal.houseNet} />
                  </td>
                  <td colSpan={5} />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      {/* ── House P&L ── */}
      {tab === "pnl" && pnlReport && (
        <>
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-semibold text-sm">
              House P&amp;L · {from} → {to}
            </h2>
            <button
              onClick={downloadPnlCsv}
              className="text-xs border rounded px-2 py-0.5 text-gray-600 hover:text-gray-900"
            >
              Download CSV
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            {(
              [
                ["Turnover", pnlReport.turnover, false],
                ["Bet Count", pnlReport.betCount, false],
                ["Players", pnlReport.players, false],
                ["Gross Win (eff)", pnlReport.grossWin, true],
                ["Gross Loss (eff)", pnlReport.grossLoss, true],
                ["Commission (from wins)", pnlReport.commission, false],
                ["Discount (on losses)", pnlReport.discount, false],
                ["Player Net", pnlReport.playerNet, true],
                ["House Net", pnlReport.houseNet, true],
              ] as [string, number, boolean][]
            ).map(([label, val, signed]) => (
              <div key={label} className="border rounded px-3 py-2">
                <div className="text-xs text-gray-500">{label}</div>
                {signed ? (
                  <div className={netColor(val)}>{signedMmk(val)}</div>
                ) : (
                  <div className="font-semibold">{mmk(val)}</div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Balances ── */}
      {tab === "balances" && balancesReport && (
        <>
          <div className="flex justify-between items-center mb-2">
            <h2 className="font-semibold text-sm">
              Player Balances ({balancesReport.rows.length} players)
            </h2>
            <button
              onClick={downloadBalancesCsv}
              className="text-xs border rounded px-2 py-0.5 text-gray-600 hover:text-gray-900"
            >
              Download CSV
            </button>
          </div>

          <div className="flex flex-wrap gap-4 mb-3 text-sm">
            <div className="border rounded px-3 py-2">
              <div className="text-xs text-gray-500">To Pay</div>
              <div className="text-green-700 font-semibold">
                {mmk(balancesReport.totals.totalToPay)}
              </div>
            </div>
            <div className="border rounded px-3 py-2">
              <div className="text-xs text-gray-500">To Collect</div>
              <div className="text-red-600 font-semibold">
                {mmk(balancesReport.totals.totalToCollect)}
              </div>
            </div>
            <div className="border rounded px-3 py-2">
              <div className="text-xs text-gray-500">Settled Total</div>
              <div className={netColor(balancesReport.totals.totalSettled)}>
                {signedMmk(balancesReport.totals.totalSettled)}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto text-xs">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-1 pr-2">Player</th>
                  <th className="py-1 pr-2 text-right">Unsettled Net</th>
                  <th className="py-1 pr-2">Direction</th>
                  <th className="py-1 pr-2 text-right">Settled Total</th>
                </tr>
              </thead>
              <tbody>
                {balancesReport.rows.map((r) => (
                  <tr key={r.playerId} className="border-b last:border-0">
                    <td className="py-1 pr-2 font-medium">{r.playerName}</td>
                    <td className="py-1 pr-2 text-right">
                      <NetCell n={r.unsettledNet} />
                    </td>
                    <td className="py-1 pr-2">
                      {r.unsettledNet > 0 ? (
                        <span className="text-green-700 font-semibold text-xs uppercase">
                          Pay
                        </span>
                      ) : r.unsettledNet < 0 ? (
                        <span className="text-red-600 font-semibold text-xs uppercase">
                          Collect
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">Even</span>
                      )}
                    </td>
                    <td className="py-1 pr-2 text-right">
                      <NetCell n={r.settledNet} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!loading &&
        !playerReport &&
        !dailyReport &&
        !pnlReport &&
        !balancesReport &&
        !error && (
          <p className="text-gray-400 text-sm">
            Set filters and click Run to generate the report.
          </p>
        )}
    </main>
  );
}
