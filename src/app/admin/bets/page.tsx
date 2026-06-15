"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { mmk, signedMmk, ball, price, pickLabel } from "@/lib/client/format";
import { gradeDetail } from "@/lib/engine/grade";
import type { GradeInput } from "@/lib/engine/grade";

type BetRow = {
  ticketNo: string;
  playerId: number;
  playerName: string;
  market: "ah" | "ou";
  side: "fav" | "dog" | "over" | "under";
  ballQ: number;
  priceC: number;
  stakeMmk: number;
  scoreHomeAtBet: number;
  scoreAwayAtBet: number;
  status: string;
  netMmk: number | null;
  feeMmk: number | null;
  settlementId: number | null;
  placedAt: string;
  favSide: "home" | "away";
  homeTeam: string;
  awayTeam: string;
  stage: string;
  matchStatus: string;
  finalHome: number | null;
  finalAway: number | null;
  voidedBy: string | null;
  voidReason: string | null;
};

type BetsResponse = {
  rows: BetRow[];
  capped: boolean;
  note: string | null;
};

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
  { value: "push", label: "Push" },
  { value: "void", label: "Void" },
];

function StatusBadge({ status }: { status: string }) {
  const base = "text-xs px-2 py-0.5 rounded font-semibold";
  switch (status) {
    case "won":
      return <span className={`${base} bg-green-100 text-green-700`}>won</span>;
    case "lost":
      return <span className={`${base} bg-red-100 text-red-600`}>lost</span>;
    case "void":
      return <span className={`${base} bg-gray-100 text-gray-500`}>void</span>;
    case "pending":
      return (
        <span className={`${base} bg-blue-100 text-blue-700`}>pending</span>
      );
    case "push":
      return <span className={`${base} bg-gray-100 text-gray-600`}>push</span>;
    default:
      return (
        <span className={`${base} bg-gray-100 text-gray-500`}>{status}</span>
      );
  }
}

type GradeLines = {
  scoreLine: string;
  mathLine: string;
  resultLine: string;
  net: number;
};

function computeGradeLines(t: BetRow): GradeLines | null {
  try {
    const finalHome = t.finalHome!;
    const finalAway = t.finalAway!;
    const effHome = Math.max(finalHome - t.scoreHomeAtBet, 0);
    const effAway = Math.max(finalAway - t.scoreAwayAtBet, 0);
    const effFav = t.favSide === "home" ? effHome : effAway;
    const effDog = t.favSide === "home" ? effAway : effHome;

    const d = gradeDetail({
      market: t.market,
      side: t.side,
      ballQ: t.ballQ,
      priceC: t.priceC,
      stake: t.stakeMmk,
      effFav,
      effDog,
    } as GradeInput);

    const fav = t.favSide === "home" ? t.homeTeam : t.awayTeam;
    const dog = t.favSide === "home" ? t.awayTeam : t.homeTeam;

    const isLive = t.scoreHomeAtBet !== 0 || t.scoreAwayAtBet !== 0;
    const scoreLine = isLive
      ? `Bet at ${t.scoreHomeAtBet}–${t.scoreAwayAtBet} · final ${finalHome}–${finalAway} · counts after-bet goals: ${effHome}–${effAway}`
      : `Final ${finalHome}–${finalAway}`;

    let mathLine: string;
    if (t.market === "ah") {
      const sign = t.side === "fav" ? "−" : "+";
      const handicapGoals = ball(t.ballQ);
      const teamLabel = t.side === "fav" ? fav : dog;
      mathLine = `${teamLabel} ${sign}${handicapGoals}: effective ${effFav}–${effDog}, d=${d.d > 0 ? "+" : ""}${d.d} → ${d.kind}`;
    } else {
      const total = effFav + effDog;
      const lineGoals = ball(t.ballQ);
      mathLine = `Total ${total} vs ${lineGoals}: d=${d.d > 0 ? "+" : ""}${d.d} → ${d.kind}`;
    }

    const net = t.netMmk!;
    let resultLine: string;
    const s = t.status;
    if (s === "won") {
      resultLine =
        d.kind === "full_win"
          ? `WON full stake +${mmk(net)}`
          : `WON on-line +${mmk(net)} (${price(t.priceC)} × ${mmk(t.stakeMmk)})`;
    } else if (s === "lost") {
      if (d.kind === "full_lose") {
        resultLine = `LOST full stake −${mmk(t.stakeMmk)}`;
      } else if (d.kind === "partial_lose") {
        resultLine = `LOST partial −${mmk(Math.abs(net))} (${d.lossFraction} × ${mmk(t.stakeMmk)})`;
      } else {
        resultLine = `LOST on-line −${mmk(Math.abs(net))} (${price(t.priceC)} × ${mmk(t.stakeMmk)})`;
      }
    } else if (s === "push") {
      resultLine = `PUSH 0 (stake returned)`;
    } else {
      resultLine = signedMmk(net);
    }

    return { scoreLine, mathLine, resultLine, net };
  } catch {
    return null;
  }
}

function GradeBreakdown({ t }: { t: BetRow }) {
  if (t.status === "void") {
    return (
      <div className="text-xs text-gray-500 mt-1 italic">
        VOIDED by {t.voidedBy ?? "unknown"}: {t.voidReason ?? ""}
      </div>
    );
  }

  if (
    t.matchStatus !== "finished" ||
    t.finalHome == null ||
    t.finalAway == null ||
    t.netMmk == null
  ) {
    return (
      <div className="text-xs text-gray-400 mt-1 italic">not yet graded</div>
    );
  }

  const lines = computeGradeLines(t);
  if (!lines) return null;

  const fee = t.feeMmk ?? 0;
  const hasFee = fee !== 0;
  const effectiveNet = lines.net + fee;

  return (
    <div className="text-xs text-gray-400 mt-1 space-y-0.5 font-mono">
      <div>{lines.scoreLine}</div>
      <div>{lines.mathLine}</div>
      <div className={lines.net >= 0 ? "text-green-600" : "text-red-500"}>
        {lines.resultLine}
      </div>
      {hasFee && (
        <>
          <div>
            {fee < 0 ? "Commission" : "Discount"}:{" "}
            {fee < 0 ? `−${mmk(Math.abs(fee))}` : `+${mmk(fee)}`} MMK
          </div>
          <div
            className={
              effectiveNet >= 0
                ? "text-green-700 font-semibold"
                : "text-red-600 font-semibold"
            }
          >
            Net after fee: {signedMmk(effectiveNet)} MMK
          </div>
        </>
      )}
    </div>
  );
}

export default function BetsPage() {
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [data, setData] = useState<BetsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  function buildUrl() {
    const params = new URLSearchParams();
    if (status !== "all") params.set("status", status);
    if (q.trim()) params.set("q", q.trim());
    return `/api/admin/bets${params.toString() ? `?${params}` : ""}`;
  }

  function fetchBets(url: string) {
    api<BetsResponse>(url)
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Failed to load");
        setLoading(false);
      });
  }

  function reload() {
    setLoading(true);
    setError("");
    fetchBets(buildUrl());
  }

  useEffect(() => {
    const params = new URLSearchParams();
    if (status !== "all") params.set("status", status);
    if (q.trim()) params.set("q", q.trim());
    const url = `/api/admin/bets${params.toString() ? `?${params}` : ""}`;
    fetchBets(url);
  }, [status, q]);

  async function handleVoid(ticketNo: string) {
    const confirmed = window.confirm(`Void ticket ${ticketNo}?`);
    if (!confirmed) return;
    const reason = window.prompt("Void reason (required):") ?? "";
    if (!reason.trim()) return;
    const key = `void-${ticketNo}`;
    setBusy((prev) => ({ ...prev, [key]: true }));
    setError("");
    try {
      await api("/api/admin/settle", { action: "void", ticketNo, reason });
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
    } finally {
      setBusy((prev) => ({ ...prev, [key]: false }));
    }
  }

  function toggleExpand(ticketNo: string) {
    setExpanded((prev) => ({ ...prev, [ticketNo]: !prev[ticketNo] }));
  }

  // Group rows by player name (alphabetical); keep each player's bets in the
  // server order (most recent first). Effective net = net + fee on graded bets.
  const groups = (() => {
    const map = new Map<string, BetRow[]>();
    for (const r of data?.rows ?? []) {
      const list = map.get(r.playerName) ?? [];
      list.push(r);
      map.set(r.playerName, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  })();

  const COLS = 7;

  return (
    <main>
      <h1 className="mb-3 text-lg font-bold">Bets by player</h1>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 items-center mb-4">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="border rounded px-2 py-1 text-sm"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Search ticket / player / team…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="border rounded px-2 py-1 text-sm flex-1 min-w-0"
        />
      </div>

      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
      {loading && <p className="text-gray-500">Loading…</p>}

      {!loading && data && (
        <>
          {data.note && (
            <p className="text-yellow-700 text-xs mb-2 bg-yellow-50 border border-yellow-200 rounded px-2 py-1">
              {data.note}
            </p>
          )}
          {data.rows.length === 0 && (
            <p className="text-gray-500 text-sm">No bets found.</p>
          )}

          {groups.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="py-2 pr-3">Ticket</th>
                    <th className="py-2 pr-3">Match</th>
                    <th className="py-2 pr-3">Pick</th>
                    <th className="py-2 pr-3 text-right">Stake</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3 text-right">Net</th>
                    <th className="py-2 w-6" aria-label="expand" />
                  </tr>
                </thead>
                {groups.map(([playerName, rows]) => {
                  const subtotal = rows.reduce(
                    (s, r) =>
                      r.netMmk != null ? s + r.netMmk + (r.feeMmk ?? 0) : s,
                    0,
                  );
                  return (
                    <tbody key={playerName}>
                      {/* Player group header */}
                      <tr className="bg-gray-50 border-y">
                        <td
                          colSpan={COLS - 2}
                          className="py-2 pr-3 font-semibold"
                        >
                          {playerName}
                          <span className="ml-2 text-xs font-normal text-gray-500">
                            ({rows.length} {rows.length === 1 ? "bet" : "bets"})
                          </span>
                        </td>
                        <td
                          colSpan={2}
                          className={`py-2 pr-3 text-right font-semibold ${
                            subtotal >= 0 ? "text-green-700" : "text-red-600"
                          }`}
                        >
                          {signedMmk(subtotal)}
                        </td>
                      </tr>

                      {rows.map((t) => {
                        const isExpanded = expanded[t.ticketNo] ?? false;
                        const pickedTeam =
                          t.market === "ah"
                            ? t.side === "fav"
                              ? t.favSide === "home"
                                ? t.homeTeam
                                : t.awayTeam
                              : t.favSide === "home"
                                ? t.awayTeam
                                : t.homeTeam
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
                        const canVoid =
                          t.status !== "void" &&
                          t.settlementId == null &&
                          t.matchStatus === "finished";
                        const voidDisabledReason =
                          t.status === "void"
                            ? "voided"
                            : t.settlementId != null
                              ? "settled"
                              : null;
                        const fee = t.feeMmk ?? 0;
                        const effNet = t.netMmk != null ? t.netMmk + fee : null;

                        return (
                          <FragmentRow key={t.ticketNo}>
                            <tr
                              className="border-b cursor-pointer hover:bg-gray-50 align-top"
                              onClick={() => toggleExpand(t.ticketNo)}
                            >
                              <td className="py-2 pr-3 font-mono text-xs text-gray-500 whitespace-nowrap">
                                {t.ticketNo}
                              </td>
                              {/* Match — bold the picked team so "which team" is obvious */}
                              <td className="py-2 pr-3 whitespace-nowrap">
                                <span
                                  className={
                                    pickedTeam === t.homeTeam
                                      ? "font-semibold"
                                      : ""
                                  }
                                >
                                  {t.homeTeam}
                                </span>
                                <span className="text-gray-400"> v </span>
                                <span
                                  className={
                                    pickedTeam === t.awayTeam
                                      ? "font-semibold"
                                      : ""
                                  }
                                >
                                  {t.awayTeam}
                                </span>
                                <div className="text-xs text-gray-400">
                                  {t.stage}
                                </div>
                              </td>
                              {/* Pick — names the team (AH) or Over/Under (O/U) */}
                              <td className="py-2 pr-3">{label}</td>
                              <td className="py-2 pr-3 text-right whitespace-nowrap">
                                {mmk(t.stakeMmk)}
                              </td>
                              <td className="py-2 pr-3">
                                <StatusBadge status={t.status} />
                              </td>
                              <td
                                className={`py-2 pr-3 text-right whitespace-nowrap ${
                                  effNet == null
                                    ? "text-gray-400"
                                    : effNet >= 0
                                      ? "text-green-700 font-semibold"
                                      : "text-red-600 font-semibold"
                                }`}
                              >
                                {effNet == null ? "—" : signedMmk(effNet)}
                                {fee !== 0 && effNet != null && (
                                  <div className="text-[10px] font-normal text-gray-400">
                                    {fee < 0 ? "comm." : "disc."}{" "}
                                    {signedMmk(fee)}
                                  </div>
                                )}
                              </td>
                              <td className="py-2 text-gray-400 text-xs">
                                {isExpanded ? "▲" : "▼"}
                              </td>
                            </tr>

                            {isExpanded && (
                              <tr className="border-b bg-gray-50/60">
                                <td colSpan={COLS} className="px-3 pb-3 pt-1">
                                  <div className="text-xs text-gray-500 mb-1">
                                    {t.homeTeam} vs {t.awayTeam} · {t.stage} ·{" "}
                                    {t.matchStatus}
                                  </div>
                                  <GradeBreakdown t={t} />
                                  <div className="mt-2">
                                    <button
                                      disabled={busy[voidKey] || !canVoid}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleVoid(t.ticketNo);
                                      }}
                                      title={voidDisabledReason ?? undefined}
                                      className="border border-red-300 text-red-600 text-xs px-2 py-0.5 rounded disabled:opacity-40"
                                    >
                                      {voidDisabledReason
                                        ? `Void (${voidDisabledReason})`
                                        : "Void"}
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </FragmentRow>
                        );
                      })}
                    </tbody>
                  );
                })}
              </table>
            </div>
          )}
        </>
      )}
    </main>
  );
}

// Groups a bet row and its (optional) expanded detail row without adding DOM
// nodes that would break <tbody> table structure.
function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
