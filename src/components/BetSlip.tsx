"use client";
import { useState } from "react";
import { api, redirectIfPinChange } from "@/lib/client/api";
import { useT } from "@/lib/i18n";
import { mmk, signedMmk, pickLabel } from "@/lib/client/format";
import { errMsg } from "@/lib/client/errMsg";
import type { MatchRow, LineRow } from "./MatchCard";

export type SlipState = {
  match: MatchRow;
  line: LineRow;
  side: "fav" | "dog" | "over" | "under";
  market: "ah" | "ou";
};
const CHIPS = [10_000, 50_000, 100_000, 500_000, 1_000_000];

/**
 * Payout preview for the new even-money + on-the-line model (Amendment A3).
 * priceC is the on-the-line fraction ×100 (integer 1–100, positive only).
 *
 * win      → +stake        (beats the line — price is irrelevant)
 * on_line  → +stake × p    (result lands exactly on the line)
 * lose     → −stake        (misses the line)
 *
 * For quarter-ball lines the on-line/half combos differ (one half wins, one is
 * on-line), but the preview shows the three primary single-outcome cases.
 */
function preview(stake: number, priceC: number) {
  const p = priceC / 100;
  return {
    win: stake,
    onLine: Math.round(stake * p),
    lose: stake,
  };
}

export function BetSlip({
  slip,
  onClose,
  onPlaced,
}: {
  slip: SlipState;
  onClose: () => void;
  onPlaced: (ticket: unknown) => void;
}) {
  const { t } = useT();
  const [stake, setStake] = useState(100_000);
  const [error, setError] = useState("");
  const [line, setLine] = useState(slip.line);
  const p = preview(stake, line.priceC);

  async function confirm() {
    try {
      const ticket = await api("/api/bets", {
        matchId: slip.match.id,
        market: slip.market,
        lineVersion: line.version,
        side: slip.side,
        stakeMmk: stake,
      });
      onPlaced(ticket);
      window.location.href = "/bets";
    } catch (e) {
      if (redirectIfPinChange(e)) return;
      const ex = e as Error & { extra?: { currentLine?: LineRow } };
      if (ex.extra?.currentLine) {
        setLine(ex.extra.currentLine);
        setError(t.lineMoved);
      } else setError(errMsg(t, e));
    }
  }

  const ouLabels = { over: t.over, under: t.under };

  return (
    <div className="fixed inset-0 z-10 bg-ink/40" onClick={onClose}>
      <div
        className="fixed bottom-0 left-0 right-0 mx-auto max-w-md rounded-t-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pb-1 pt-3">
          <div className="h-1 w-10 rounded-full bg-ink/20" />
        </div>

        <div className="p-4 pb-8">
          {/* Pick title */}
          <h2 className="font-display text-xl text-ink">
            {pickLabel(
              { ...line, market: slip.market },
              slip.match,
              slip.side,
              ouLabels,
            )}
          </h2>
          {slip.match.status === "live" && (
            <p className="text-base text-ca">
              {t.scoreNow}: {slip.match.homeScore}–{slip.match.awayScore} ·{" "}
              {t.liveNote}
            </p>
          )}

          {/* Stake input */}
          <input
            className="font-display my-3 w-full rounded-lg border border-ink/20 bg-white p-5 text-3xl text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
            inputMode="numeric"
            value={mmk(stake)}
            onChange={(e) =>
              setStake(Number(e.target.value.replace(/\D/g, "")) || 0)
            }
          />

          {/* Chips */}
          <div className="flex flex-wrap gap-2">
            {CHIPS.map((c) => (
              <button
                key={c}
                className="rounded-full border border-ink/20 px-4 py-3 text-base font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
                onClick={() => setStake(c)}
              >
                {c >= 1_000_000 ? `${c / 1_000_000}M` : `${c / 1_000}k`}
              </button>
            ))}
          </div>

          {/* 3-outcome preview — 2-col grid (even-money model) */}
          <div className="my-3 grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-canvas p-3 text-base leading-relaxed">
            <span className="text-ink/50">{t.outWin}</span>
            <span className="font-semibold text-mx">{signedMmk(p.win)}</span>
            <span className="text-ink/50">{t.outOnLine}</span>
            <span className="font-semibold text-mx">{signedMmk(p.onLine)}</span>
            <span className="text-ink/50">{t.outLose}</span>
            <span className="font-semibold text-ca">{signedMmk(-p.lose)}</span>
          </div>

          {error && (
            <p className="mb-2 text-center text-base text-ca">{error}</p>
          )}

          {/* CONFIRM — bg-mx (placing money = green) */}
          <button
            className="w-full rounded-lg bg-mx p-5 text-xl font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
            onClick={confirm}
          >
            {t.confirmBet}
          </button>
        </div>
      </div>
    </div>
  );
}
