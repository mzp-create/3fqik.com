"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { api, redirectIfPinChange } from "@/lib/client/api";
import { useSse } from "@/lib/client/useSse";
import { useT } from "@/lib/i18n";
import { mmk, ball, priceSigned, winNeed } from "@/lib/client/format";
import { flag, teamName } from "@/lib/client/flags";
import { errMsg } from "@/lib/client/errMsg";
import type { MatchRow, LineRow } from "@/components/MatchCard";

const CHIPS = [10_000, 50_000, 100_000, 500_000, 1_000_000];
type Side = "fav" | "dog" | "over" | "under";

/** Payout preview for the Malay signed-price model (see grade.ts). */
function preview(stake: number, priceC: number, ballQ: number) {
  const winNet = priceC > 0 ? Math.round((priceC * stake) / 100) : stake;
  const loseNet =
    priceC > 0 ? -stake : -Math.round((Math.abs(priceC) * stake) / 100);
  const showPush = ballQ % 4 === 0;
  return { winNet, loseNet, showPush };
}

/** Price for a side on a line: fav/over → priceC, dog/under → priceOppC. */
function sidePrice(line: LineRow, side: Side): number | null {
  return side === "fav" || side === "over" ? line.priceC : line.priceOppC;
}

function BetPageInner() {
  const { t } = useT();
  const router = useRouter();
  const params = useParams<{ matchId: string }>();
  const search = useSearchParams();
  const matchId = Number(params.matchId);
  const market = (search.get("market") === "ou" ? "ou" : "ah") as "ah" | "ou";

  const [match, setMatch] = useState<MatchRow | null>(null);
  const [line, setLine] = useState<LineRow | null>(null);
  const [side, setSide] = useState<Side>(
    (search.get("side") as Side) ?? (market === "ou" ? "over" : "fav"),
  );
  const [stake, setStake] = useState(100_000);
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = () =>
    api<MatchRow>(`/api/matches/${matchId}`)
      .then((m) => {
        setMatch(m);
        setLine(market === "ou" ? (m.ouLine ?? null) : (m.line ?? null));
      })
      .catch((e) => {
        if (!redirectIfPinChange(e)) setError(errMsg(t, e));
      })
      .finally(() => setLoading(false));

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useSse(
    {
      line_update: () => reload(),
      score_update: () => reload(),
      match_final: () => reload(),
    },
    reload,
  );

  function changeStake(v: number) {
    setStake(v);
    setArmed(false);
  }
  function changeSide(s: Side) {
    setSide(s);
    setArmed(false);
    setError("");
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
    if (!line) return;
    setBusy(true);
    try {
      await api("/api/bets", {
        matchId,
        market,
        lineVersion: line.version,
        side,
        stakeMmk: stake,
      });
      router.push("/bets");
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

  if (loading) return <main className="p-4 text-center text-ink/40">…</main>;

  if (!match || !line || line.status === "closed")
    return (
      <main className="p-4">
        <BackBar onBack={() => router.back()} label={t.backToMatches} />
        <p className="mt-8 text-center text-ink/40">{error || "—"}</p>
      </main>
    );

  const m = match;
  const fav = line.favSide === "home" ? m.homeTeam : m.awayTeam;
  const dog = line.favSide === "home" ? m.awayTeam : m.homeTeam;
  const suspended = line.status === "suspended";

  // The two outcomes for this market — Polymarket-style pick-a-side.
  const outcomes: {
    side: Side;
    label: string;
    sub: string;
    tone: "mx" | "us";
  }[] =
    market === "ah"
      ? [
          {
            side: "fav",
            label: `${flag(fav)} ${teamName(fav)}`,
            sub: `−${ball(line.ballQ)}`,
            tone: "mx",
          },
          {
            side: "dog",
            label: `${flag(dog)} ${teamName(dog)}`,
            sub: `+${ball(line.ballQ)}`,
            tone: "us",
          },
        ]
      : [
          {
            side: "over",
            label: t.over,
            sub: `${ball(line.ballQ)} ${t.goalsWord}`,
            tone: "mx",
          },
          {
            side: "under",
            label: t.under,
            sub: `${ball(line.ballQ)} ${t.goalsWord}`,
            tone: "us",
          },
        ];

  const selPrice = sidePrice(line, side);
  const p = selPrice != null ? preview(stake, selPrice, line.ballQ) : null;
  const valid = stake >= 10_000 && selPrice != null && !suspended;
  const pickWord = outcomes.find((o) => o.side === side);
  const pickText = pickWord ? `${pickWord.label} ${pickWord.sub}` : "";
  // Plain-language "what result wins this bet" for the selected side.
  const need = winNeed({
    market,
    side,
    ballQ: line.ballQ,
    favName: teamName(fav),
    dogName: teamName(dog),
    live: m.status === "live",
  });

  return (
    <main className="p-4">
      <BackBar onBack={() => router.back()} label={t.backToMatches} />

      {/* Match header — make "which match" unmissable */}
      <div className="mt-2 rounded-xl bg-canvas px-3 py-3 text-center">
        <div className="text-lg font-semibold text-ink">
          {flag(m.homeTeam)} {teamName(m.homeTeam)} vs {teamName(m.awayTeam)}{" "}
          {flag(m.awayTeam)}
        </div>
        <div className="text-sm text-ink/50">{m.stage}</div>
        {m.status === "live" && (
          <div className="text-sm font-semibold text-ca">
            {t.scoreNow}: {m.homeScore}–{m.awayScore} · {t.liveNote}
          </div>
        )}
      </div>

      {/* Pick a side — two big, clear outcome buttons */}
      <p className="mt-4 text-base text-ink/50">{t.betBacking}</p>
      <div className="mt-1 grid grid-cols-2 gap-3">
        {outcomes.map((o) => {
          const op = sidePrice(line, o.side);
          const selected = side === o.side;
          const rail = o.tone === "mx" ? "bg-mx" : "bg-us";
          const priceColor = o.tone === "mx" ? "text-mx" : "text-us";
          return (
            <button
              key={o.side}
              disabled={op == null}
              onClick={() => changeSide(o.side)}
              className={`relative overflow-hidden rounded-xl border-2 p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us disabled:opacity-30 ${
                selected ? "border-ink bg-ink/5" : "border-ink/15 bg-white"
              }`}
              style={{ minHeight: "104px" }}
            >
              <span className={`absolute inset-y-0 left-0 w-1.5 ${rail}`} />
              {selected && (
                <span className="absolute right-2 top-2 text-sm font-bold text-ink">
                  ✓
                </span>
              )}
              <span className="block pl-2 text-base font-bold uppercase tracking-wide text-ink">
                {o.label}
              </span>
              <span className="block pl-2 text-base text-ink/50">{o.sub}</span>
              <span
                className={`font-display block pl-2 text-3xl ${priceColor}`}
              >
                {op != null ? priceSigned(op) : "—"}
              </span>
            </button>
          );
        })}
      </div>

      {/* What result wins this bet — grandpa-clear */}
      <div className="mt-3 rounded-lg border border-mx/30 bg-mx/5 p-3">
        <div className="flex items-baseline gap-2">
          <span className="text-base font-bold text-mx">✓ {t.winIf}</span>
          <span className="text-base font-semibold text-ink">{need.text}</span>
        </div>
        {need.push && (
          <div className="mt-0.5 text-sm text-ink/50">↩ {need.push}</div>
        )}
      </div>

      {suspended && (
        <p className="mt-3 text-center text-base text-ink/50">
          ⏸ {t.suspended}
        </p>
      )}

      {/* Stake */}
      <label className="mt-5 block text-base text-ink/50">{t.yourStake}</label>
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

      {/* Plain-MMK payout */}
      {p && (
        <div className="my-4 space-y-1.5 rounded-lg bg-canvas p-3">
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
      )}

      {error && <p className="mb-2 text-center text-base text-ca">{error}</p>}

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
          {t.placeReview.replace("{pick}", pickText)}
        </p>
      )}
    </main>
  );
}

function BackBar({ onBack, label }: { onBack: () => void; label: string }) {
  return (
    <button
      onClick={onBack}
      className="flex items-center gap-1 text-base font-semibold text-ink/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
    >
      <span aria-hidden>←</span> {label}
    </button>
  );
}

export default function BetPage() {
  // useSearchParams must sit under a Suspense boundary for the production build.
  return (
    <Suspense fallback={<main className="p-4 text-center text-ink/40">…</main>}>
      <BetPageInner />
    </Suspense>
  );
}
