"use client";
import { useState } from "react";
import { api, redirectIfPinChange } from "@/lib/client/api";
import { useT } from "@/lib/i18n";
import { mmk, signedMmk, pickLabel } from "@/lib/client/format";
import { errMsg } from "@/lib/client/errMsg";
import type { MatchRow, LineRow } from "./MatchCard";

export type SlipState = { match: MatchRow; line: LineRow; side: "fav" | "dog" };
const CHIPS = [10_000, 50_000, 100_000, 500_000, 1_000_000];

function preview(stake: number, priceC: number) {
  const win = priceC > 0 ? Math.round((stake * priceC) / 100) : stake;
  const lose = priceC > 0 ? stake : Math.round((stake * -priceC) / 100);
  return {
    win,
    halfWin: Math.round(win / 2),
    lose,
    halfLose: Math.round(lose / 2),
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
          <h2 className="font-display text-lg text-ink">
            {pickLabel(line, slip.match, slip.side)}
          </h2>
          {slip.match.status === "live" && (
            <p className="text-sm text-ca">
              {t.scoreNow}: {slip.match.homeScore}–{slip.match.awayScore} ·{" "}
              {t.liveNote}
            </p>
          )}

          {/* Stake input */}
          <input
            className="font-display my-3 w-full rounded-lg border border-ink/20 bg-white p-4 text-2xl text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
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
                className="rounded-full border border-ink/20 px-3 py-1.5 text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
                onClick={() => setStake(c)}
              >
                {c >= 1_000_000 ? `${c / 1_000_000}M` : `${c / 1_000}k`}
              </button>
            ))}
          </div>

          {/* 5-outcome preview — 2-col grid */}
          <div className="my-3 grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-canvas p-3 text-sm leading-6">
            <span className="text-ink/50">{t.outWin}</span>
            <span className="font-semibold text-mx">{signedMmk(p.win)}</span>
            <span className="text-ink/50">{t.outHalfWin}</span>
            <span className="font-semibold text-mx">
              {signedMmk(p.halfWin)}
            </span>
            <span className="text-ink/50">{t.outPush}</span>
            <span className="font-semibold text-gray-500">0</span>
            <span className="text-ink/50">{t.outHalfLose}</span>
            <span className="font-semibold text-ca">
              {signedMmk(-p.halfLose)}
            </span>
            <span className="text-ink/50">{t.outLose}</span>
            <span className="font-semibold text-ca">{signedMmk(-p.lose)}</span>
          </div>

          {error && <p className="mb-2 text-center text-sm text-ca">{error}</p>}

          {/* CONFIRM — bg-mx (placing money = green) */}
          <button
            className="w-full rounded-lg bg-mx p-4 text-lg font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
            onClick={confirm}
          >
            {t.confirmBet}
          </button>
        </div>
      </div>
    </div>
  );
}
