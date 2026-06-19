"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { mmk, signedMmk, pickLabel } from "@/lib/client/format";
import { gradeBreakdown } from "@/lib/client/gradeBreakdown";

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
  reconcileNote: string | null;
};

type BetsResponse = {
  rows: BetRow[];
  capped: boolean;
  note: string | null;
};

// Minimal shapes for the Record-bet dropdowns.
type PlayerOpt = { id: number; displayName: string; phone: string };
type MatchOpt = {
  id: number;
  homeTeam: string;
  awayTeam: string;
  status: string;
  kickoffUtc: string;
};
type RecordedBet = { ticketNo: string };

type Market = "ah" | "ou";
type Side = "fav" | "dog" | "over" | "under";
const SIDES_BY_MARKET: Record<Market, { value: Side; label: string }[]> = {
  ah: [
    { value: "fav", label: "Favourite" },
    { value: "dog", label: "Underdog" },
  ],
  ou: [
    { value: "over", label: "Over" },
    { value: "under", label: "Under" },
  ],
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
      return <span className={`${base} bg-mx/15 text-mx-neon`}>won</span>;
    case "lost":
      return <span className={`${base} bg-ca/15 text-ca`}>lost</span>;
    case "void":
      return <span className={`${base} bg-raised text-muted`}>void</span>;
    case "pending":
      return <span className={`${base} bg-us/15 text-us-neon`}>pending</span>;
    case "push":
      return <span className={`${base} bg-raised text-muted`}>push</span>;
    default:
      return <span className={`${base} bg-raised text-muted`}>{status}</span>;
  }
}

function GradeBreakdown({ t }: { t: BetRow }) {
  const flag = t.reconcileNote ? (
    <div className="mt-1 rounded border border-gold/40 bg-gold/15 px-2 py-1 text-xs text-gold">
      ⚑ {t.reconcileNote}
    </div>
  ) : null;
  if (t.status === "void") {
    return (
      <div className="text-xs text-muted mt-1 italic">
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
      <>
        {flag}
        <div className="text-xs text-faint mt-1 italic">not yet graded</div>
      </>
    );
  }

  const lines = gradeBreakdown({
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
    finalHome: t.finalHome,
    finalAway: t.finalAway,
  });
  if (!lines) return flag;

  const fee = t.feeMmk ?? 0;
  const hasFee = fee !== 0;
  const effectiveNet = lines.net + fee;

  return (
    <div className="text-xs text-faint mt-1 space-y-0.5 font-mono">
      {flag}
      <div>{lines.scoreLine}</div>
      <div>{lines.mathLine}</div>
      <div className={lines.net >= 0 ? "text-mx-neon" : "text-ca"}>
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
                ? "text-mx-neon font-semibold"
                : "text-ca font-semibold"
            }
          >
            Net after fee: {signedMmk(effectiveNet)} MMK
          </div>
        </>
      )}
    </div>
  );
}

function RecordBetPanel({ onRecorded }: { onRecorded: () => void }) {
  const [open, setOpen] = useState(false);
  const [players, setPlayers] = useState<PlayerOpt[]>([]);
  const [matches, setMatches] = useState<MatchOpt[]>([]);
  const [playerId, setPlayerId] = useState("");
  const [matchId, setMatchId] = useState("");
  const [market, setMarket] = useState<Market>("ah");
  const [side, setSide] = useState<Side>("fav");
  const [stake, setStake] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    api<PlayerOpt[]>("/api/admin/players")
      .then((rows) =>
        setPlayers(
          [...rows].sort((a, b) => a.displayName.localeCompare(b.displayName)),
        ),
      )
      .catch((e) => setErr(e instanceof Error ? e.message : "error"));
    api<MatchOpt[]>("/api/matches")
      .then((rows) =>
        setMatches(
          [...rows].sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc)),
        ),
      )
      .catch((e) => setErr(e instanceof Error ? e.message : "error"));
  }, []);

  // Side options depend on market; reset the side when the market changes.
  function changeMarket(m: Market) {
    setMarket(m);
    setSide(SIDES_BY_MARKET[m][0].value);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setSuccess("");
    const pid = Number(playerId);
    const mid = Number(matchId);
    const stakeMmk = Number(stake);
    if (!Number.isInteger(pid) || pid <= 0) return setErr("Choose a player.");
    if (!Number.isInteger(mid) || mid <= 0) return setErr("Choose a match.");
    if (!Number.isInteger(stakeMmk) || stakeMmk <= 0)
      return setErr("Enter a whole-number stake in MMK.");
    setSubmitting(true);
    try {
      const bet = await api<RecordedBet>("/api/admin/bets", {
        action: "record",
        playerId: pid,
        matchId: mid,
        market,
        side,
        stakeMmk,
      });
      setSuccess(`Recorded ${bet.ticketNo}`);
      setStake("");
      onRecorded();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "error");
    } finally {
      setSubmitting(false);
    }
  }

  const field =
    "bg-raised border-border text-ink placeholder:text-faint focus-visible:ring-us w-full rounded border px-2 py-1.5 text-sm";
  const labelCls = "block text-xs font-medium text-muted mb-1";

  return (
    <section className="border-border bg-surface mb-5 rounded-lg border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="text-ink focus-visible:ring-us flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-semibold"
      >
        <span>➕ Record bet</span>
        <span className="text-faint text-xs">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <form onSubmit={submit} className="border-border border-t px-3 py-3">
          <p className="text-muted mb-3 text-xs leading-relaxed">
            Records a bet on the player&apos;s behalf, bypassing the
            match-started block. Price is taken from the latest posted line;
            score-at-bet is 0–0 (pre-match).
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="rb-player">
                Player
              </label>
              <select
                id="rb-player"
                value={playerId}
                onChange={(e) => setPlayerId(e.target.value)}
                className={field}
              >
                <option value="">Select player…</option>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.displayName} ({p.phone})
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="rb-match">
                Match
              </label>
              <select
                id="rb-match"
                value={matchId}
                onChange={(e) => setMatchId(e.target.value)}
                className={field}
              >
                <option value="">Select match…</option>
                {matches.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.homeTeam} v {m.awayTeam} — {m.status}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelCls} htmlFor="rb-market">
                Market
              </label>
              <select
                id="rb-market"
                value={market}
                onChange={(e) => changeMarket(e.target.value as Market)}
                className={field}
              >
                <option value="ah">Asian handicap</option>
                <option value="ou">Over / Under</option>
              </select>
            </div>

            <div>
              <label className={labelCls} htmlFor="rb-side">
                Side
              </label>
              <select
                id="rb-side"
                value={side}
                onChange={(e) => setSide(e.target.value as Side)}
                className={field}
              >
                {SIDES_BY_MARKET[market].map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="rb-stake">
                Stake (MMK)
              </label>
              <input
                id="rb-stake"
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                placeholder="e.g. 50000"
                value={stake}
                onChange={(e) => setStake(e.target.value)}
                className={field}
              />
            </div>
          </div>

          {err && <p className="text-ca mt-3 text-sm">{err}</p>}
          {success && <p className="text-mx-neon mt-3 text-sm">{success}</p>}

          <div className="mt-3">
            <button
              type="submit"
              disabled={submitting}
              className="bg-us focus-visible:ring-us rounded px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {submitting ? "Recording…" : "Record bet"}
            </button>
          </div>
        </form>
      )}
    </section>
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

      <RecordBetPanel onRecorded={reload} />

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 items-center mb-4">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="bg-raised border-border text-ink placeholder:text-faint focus-visible:ring-us rounded border px-2 py-1 text-sm"
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
          className="bg-raised border-border text-ink placeholder:text-faint focus-visible:ring-us min-w-0 flex-1 rounded border px-2 py-1 text-sm"
        />
      </div>

      {error && <p className="text-ca text-sm mb-3">{error}</p>}
      {loading && <p className="text-muted">Loading…</p>}

      {!loading && data && (
        <>
          {data.note && (
            <p className="text-gold text-xs mb-2 bg-gold/15 border border-gold/40 rounded px-2 py-1">
              {data.note}
            </p>
          )}
          {data.rows.length === 0 && (
            <p className="text-muted text-sm">No bets found.</p>
          )}

          {groups.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-surface-2 border-border border-b text-left text-xs uppercase tracking-wide text-muted">
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
                      <tr className="bg-surface-2 border-border border-y">
                        <td
                          colSpan={COLS - 2}
                          className="py-2 pr-3 font-semibold"
                        >
                          {playerName}
                          <span className="ml-2 text-xs font-normal text-muted">
                            ({rows.length} {rows.length === 1 ? "bet" : "bets"})
                          </span>
                        </td>
                        <td
                          colSpan={2}
                          className={`py-2 pr-3 text-right font-semibold ${
                            subtotal >= 0 ? "text-mx-neon" : "text-ca"
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
                              className="border-border hover:bg-raised cursor-pointer border-b align-top"
                              onClick={() => toggleExpand(t.ticketNo)}
                            >
                              <td className="py-2 pr-3 font-mono text-xs text-muted whitespace-nowrap">
                                {t.ticketNo}
                                {t.reconcileNote && (
                                  <span
                                    title={t.reconcileNote}
                                    className="ml-1 rounded bg-gold/15 px-1 text-gold"
                                  >
                                    ⚑
                                  </span>
                                )}
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
                                <span className="text-faint"> v </span>
                                <span
                                  className={
                                    pickedTeam === t.awayTeam
                                      ? "font-semibold"
                                      : ""
                                  }
                                >
                                  {t.awayTeam}
                                </span>
                                <div className="text-xs text-faint">
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
                                    ? "text-faint"
                                    : effNet >= 0
                                      ? "text-mx-neon font-semibold"
                                      : "text-ca font-semibold"
                                }`}
                              >
                                {effNet == null ? "—" : signedMmk(effNet)}
                                {fee !== 0 && effNet != null && (
                                  <div className="text-[10px] font-normal text-faint">
                                    {fee < 0 ? "comm." : "disc."}{" "}
                                    {signedMmk(fee)}
                                  </div>
                                )}
                              </td>
                              <td className="py-2 text-faint text-xs">
                                {isExpanded ? "▲" : "▼"}
                              </td>
                            </tr>

                            {isExpanded && (
                              <tr className="border-border bg-raised/60 border-b">
                                <td colSpan={COLS} className="px-3 pb-3 pt-1">
                                  <div className="text-xs text-muted mb-1">
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
                                      className="border border-ca text-ca text-xs px-2 py-0.5 rounded disabled:opacity-40"
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
