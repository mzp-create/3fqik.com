"use client";
import { useRef, useState } from "react";
import { api, redirectIfPinChange } from "@/lib/client/api";
import { useT } from "@/lib/i18n";
import { mmk, ball, priceSigned } from "@/lib/client/format";
import { flag, teamName } from "@/lib/client/flags";
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
 * Payout preview for the Malay signed-price model.
 *   WIN  → p>0: +round(p·stake)   p<0: +stake
 *   LOSE → p>0: −stake            p<0: −round(|p|·stake)
 *   PUSH → 0 (refund) — only possible on whole-number lines (ballQ % 4 === 0).
 */
function preview(stake: number, priceC: number, ballQ: number) {
  const winNet = priceC > 0 ? Math.round((priceC * stake) / 100) : stake;
  const loseNet =
    priceC > 0 ? -stake : -Math.round((Math.abs(priceC) * stake) / 100);
  const showPush = ballQ % 4 === 0;
  return { winNet, loseNet, showPush };
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
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const p = preview(stake, line.priceC, line.ballQ);

  const m = slip.match;
  const fav = line.favSide === "home" ? m.homeTeam : m.awayTeam;
  const dog = line.favSide === "home" ? m.awayTeam : m.homeTeam;
  // Plain-language pick: which team / over-under + the handicap or goals line.
  const pick =
    slip.market === "ah"
      ? slip.side === "fav"
        ? `${teamName(fav)} −${ball(line.ballQ)}`
        : `${teamName(dog)} +${ball(line.ballQ)}`
      : `${slip.side === "over" ? t.over : t.under} ${ball(line.ballQ)} ${t.goalsWord}`;

  // Reset the armed (2-tap) state whenever the stake changes.
  function changeStake(v: number) {
    setStake(v);
    setArmed(false);
  }

  function onButton() {
    if (busy) return;
    if (!armed) {
      setArmed(true);
      if (armTimer.current) clearTimeout(armTimer.current);
      armTimer.current = setTimeout(() => setArmed(false), 4000);
      return;
    }
    void confirm();
  }

  async function confirm() {
    setBusy(true);
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
      setBusy(false);
      setArmed(false);
      if (redirectIfPinChange(e)) return;
      const ex = e as Error & { extra?: { currentLine?: LineRow } };
      if (ex.extra?.currentLine) {
        setLine(ex.extra.currentLine);
        setError(t.lineMoved);
      } else setError(errMsg(t, e));
    }
  }

  const valid = stake >= 10_000;

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
          {/* Match — make "which match" unmissable */}
          <div className="rounded-lg bg-canvas px-3 py-2 text-center">
            <div className="text-lg font-semibold text-ink">
              {flag(m.homeTeam)} {teamName(m.homeTeam)} vs{" "}
              {teamName(m.awayTeam)} {flag(m.awayTeam)}
            </div>
            <div className="text-sm text-ink/50">{m.stage}</div>
            {m.status === "live" && (
              <div className="text-sm font-semibold text-ca">
                {t.scoreNow}: {m.homeScore}–{m.awayScore} · {t.liveNote}
              </div>
            )}
          </div>

          {/* Your pick — plain language; price is a small detail */}
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-base text-ink/50">{t.betBacking}</span>
            <span className="font-display text-2xl text-ink">{pick}</span>
          </div>
          <div className="text-right text-sm text-ink/40">
            {t.priceWord} {priceSigned(line.priceC)}
          </div>

          {/* Stake */}
          <label className="mt-3 block text-base text-ink/50">
            {t.yourStake}
          </label>
          <input
            className="font-display mt-1 w-full rounded-lg border border-ink/20 bg-white p-4 text-3xl text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
            inputMode="numeric"
            value={mmk(stake)}
            onChange={(e) =>
              changeStake(Number(e.target.value.replace(/\D/g, "")) || 0)
            }
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {CHIPS.map((c) => (
              <button
                key={c}
                className="rounded-full border border-ink/20 px-4 py-3 text-base font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
                onClick={() => changeStake(c)}
              >
                {c >= 1_000_000 ? `${c / 1_000_000}M` : `${c / 1_000}k`}
              </button>
            ))}
          </div>

          {/* Plain-MMK payout — lead with the amounts, not the price jargon */}
          <div className="my-3 space-y-1.5 rounded-lg bg-canvas p-3">
            <div className="flex items-center justify-between">
              <span className="text-base text-ink/60">{t.ifWin}</span>
              <span className="font-display text-xl text-mx">
                +{mmk(p.winNet)}
              </span>
            </div>
            {p.showPush && (
              <div className="flex items-center justify-between">
                <span className="text-base text-ink/60">{t.ifPush}</span>
                <span className="text-base font-semibold text-ink/50">
                  {mmk(stake)}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-base text-ink/60">{t.ifLose}</span>
              <span className="font-display text-xl text-ca">
                −{mmk(Math.abs(p.loseNet))}
              </span>
            </div>
          </div>

          {error && (
            <p className="mb-2 text-center text-base text-ca">{error}</p>
          )}

          {/* Deliberate 2-tap confirm; the amount is on the button */}
          <button
            disabled={!valid || busy}
            className={`w-full rounded-lg p-5 text-xl font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us disabled:opacity-40 ${
              armed ? "bg-ca" : "bg-mx"
            }`}
            onClick={onButton}
          >
            {busy
              ? "…"
              : !valid
                ? t.minStakeNote
                : armed
                  ? t.placeConfirm.replace("{n}", mmk(stake))
                  : t.placeBtn.replace("{n}", mmk(stake))}
          </button>
          {armed && !busy && (
            <p className="mt-2 text-center text-sm text-ink/50">
              {t.placeReview.replace("{pick}", pick)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
