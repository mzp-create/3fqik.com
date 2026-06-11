"use client";
import { useState } from "react";
import { api } from "@/lib/client/api";
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
      const ex = e as Error & { extra?: { currentLine?: LineRow } };
      if (ex.extra?.currentLine) {
        setLine(ex.extra.currentLine);
        setError(t.lineMoved);
      } else setError(errMsg(t, e));
    }
  }

  return (
    <div className="fixed inset-0 z-10 bg-black/40" onClick={onClose}>
      <div
        className="fixed bottom-0 left-0 right-0 mx-auto max-w-md rounded-t-2xl bg-white p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold">
          {pickLabel(line, slip.match, slip.side)}
        </h2>
        {slip.match.status === "live" && (
          <p className="text-sm text-red-600">
            {t.scoreNow}: {slip.match.homeScore}–{slip.match.awayScore} ·{" "}
            {t.liveNote}
          </p>
        )}
        <input
          className="my-3 w-full rounded-xl border p-4 text-xl"
          inputMode="numeric"
          value={mmk(stake)}
          onChange={(e) =>
            setStake(Number(e.target.value.replace(/\D/g, "")) || 0)
          }
        />
        <div className="flex flex-wrap gap-2">
          {CHIPS.map((c) => (
            <button
              key={c}
              className="rounded-lg bg-gray-100 px-3 py-2 text-sm"
              onClick={() => setStake(c)}
            >
              {c >= 1_000_000 ? `${c / 1_000_000}M` : `${c / 1_000}k`}
            </button>
          ))}
        </div>
        <div className="my-3 rounded-lg bg-gray-50 p-3 text-sm leading-6">
          {t.outWin}: <b className="text-green-700">{signedMmk(p.win)}</b> ·{" "}
          {t.outHalfWin}: {signedMmk(p.halfWin)}
          <br />
          {t.outLose}: <b className="text-red-600">{signedMmk(-p.lose)}</b> ·{" "}
          {t.outHalfLose}: {signedMmk(-p.halfLose)} · {t.outPush}: 0
        </div>
        {error && <p className="mb-2 text-center text-red-600">{error}</p>}
        <button
          className="w-full rounded-xl bg-green-700 p-4 text-lg font-bold text-white"
          onClick={confirm}
        >
          {t.confirmBet}
        </button>
      </div>
    </div>
  );
}
