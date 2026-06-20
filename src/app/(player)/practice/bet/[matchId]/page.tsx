"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { api, redirectIfPinChange } from "@/lib/client/api";
import { useT } from "@/lib/i18n";
import {
  mmk,
  ball,
  priceSigned,
  winNeed,
  matchStarted,
} from "@/lib/client/format";
import { flag, teamName, teamLabel } from "@/lib/client/flags";
import { errMsg } from "@/lib/client/errMsg";
import type { MatchRow, LineRow } from "@/components/MatchCard";
import { usePractice } from "@/lib/client/practice";

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

/** Sticky PRACTICE banner shown at the top of every practice screen. */
function PracticeBanner({ banner }: { banner: string }) {
  return (
    <div className="sticky top-0 z-20 -mx-4 mb-3 bg-canvas/95 px-4 py-2 backdrop-blur">
      <div className="rounded-lg border border-gold/30 bg-gold/15 px-3 py-2 text-center text-base font-bold uppercase tracking-wide text-gold">
        {banner}
      </div>
    </div>
  );
}

function PracticeBetInner() {
  const { t } = useT();
  const router = useRouter();
  const params = useParams<{ matchId: string }>();
  const search = useSearchParams();
  const matchId = Number(params.matchId);
  const market = (search.get("market") === "ou" ? "ou" : "ah") as "ah" | "ou";

  // Practice placement — client-only, no real bet API.
  const { placeDemo } = usePractice();

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

  useEffect(() => {
    api<MatchRow>(`/api/matches/${matchId}`)
      .then((m) => {
        setMatch(m);
        setLine(market === "ou" ? (m.ouLine ?? null) : (m.line ?? null));
      })
      .catch((e) => {
        if (!redirectIfPinChange(e)) setError(errMsg(t, e));
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    confirm();
  }

  // CONFIRM = practice. Records a demo bet in the client store; never touches
  // the real placement path.
  function confirm() {
    if (!line) return;
    const selectedSidePrice = sidePrice(line, side);
    if (selectedSidePrice == null) return;
    const m = match;
    if (!m) return;
    setBusy(true);
    placeDemo({
      matchId,
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      market,
      side,
      favSide: line.favSide,
      ballQ: line.ballQ,
      priceC: selectedSidePrice,
      stakeMmk: stake,
    });
    router.push("/practice");
  }

  if (loading)
    return (
      <main className="min-h-screen bg-canvas p-4 text-center text-muted">
        …
      </main>
    );

  if (!match || !line || line.status === "closed")
    return (
      <main className="min-h-screen bg-canvas p-4">
        <PracticeBanner banner={t.practiceBanner} />
        <BackBar onBack={() => router.back()} label={t.backToMatches} />
        <p className="mt-8 text-center text-muted">{error || "—"}</p>
      </main>
    );

  const m = match;
  const fav = line.favSide === "home" ? m.homeTeam : m.awayTeam;
  const dog = line.favSide === "home" ? m.awayTeam : m.homeTeam;
  const suspended = line.status === "suspended";
  // Betting is closed once the match has started (mirrors the real page).
  const started = matchStarted(m);

  // The two outcomes for this market — pick-a-side.
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
            label: `${flag(fav)} ${teamLabel(fav)}`,
            sub: `−${ball(line.ballQ)}`,
            tone: "mx",
          },
          {
            side: "dog",
            label: `${flag(dog)} ${teamLabel(dog)}`,
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
  const valid = stake >= 10_000 && selPrice != null && !suspended && !started;
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

  // Match header — shared by the betting view and the started/closed view.
  const header = (
    <div className="mt-2 rounded-xl border border-border bg-surface px-3 py-3 text-center">
      <div className="text-lg font-semibold text-ink">
        {flag(m.homeTeam)} {teamLabel(m.homeTeam)} vs {teamLabel(m.awayTeam)}{" "}
        {flag(m.awayTeam)}
      </div>
      <div className="text-sm text-faint">{m.stage}</div>
      {m.status === "live" && (
        <div className="text-sm font-semibold text-ca">
          {t.scoreNow}: {m.homeScore}–{m.awayScore} · {t.liveNote}
        </div>
      )}
    </div>
  );

  // Match started → betting is closed (mirrors the real page).
  if (started)
    return (
      <main className="min-h-screen bg-canvas p-4">
        <PracticeBanner banner={t.practiceBanner} />
        <BackBar onBack={() => router.back()} label={t.backToMatches} />
        {header}
        <div className="mt-4 rounded-xl border border-border bg-surface p-6 text-center">
          <div className="text-3xl">⏸</div>
          <p className="mt-2 font-display text-xl text-ink">
            {t.matchStartedNote}
          </p>
        </div>
      </main>
    );

  return (
    <main className="min-h-screen bg-canvas p-4">
      <PracticeBanner banner={t.practiceBanner} />
      <BackBar onBack={() => router.back()} label={t.backToMatches} />

      {header}

      {/* Pick a side — two big, clear outcome buttons */}
      <p className="mt-4 text-base text-muted">{t.betBacking}</p>
      <div className="mt-1 grid grid-cols-2 gap-3">
        {outcomes.map((o) => {
          const op = sidePrice(line, o.side);
          const selected = side === o.side;
          const rail = o.tone === "mx" ? "bg-mx" : "bg-us";
          const priceColor = o.tone === "mx" ? "text-mx-neon" : "text-us-neon";
          return (
            <button
              key={o.side}
              disabled={op == null}
              onClick={() => changeSide(o.side)}
              className={`relative overflow-hidden rounded-xl border-2 p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us disabled:opacity-30 ${
                selected ? "border-ink bg-surface" : "border-border bg-raised"
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
              <span className="block pl-2 text-base text-muted">{o.sub}</span>
              <span
                className={`font-display block pl-2 text-3xl ${priceColor}`}
              >
                {op != null ? priceSigned(op) : "—"}
              </span>
            </button>
          );
        })}
      </div>

      {/* What result wins this bet */}
      <div className="mt-3 rounded-lg border border-mx/30 bg-mx/10 p-3">
        <div className="flex items-baseline gap-2">
          <span className="text-base font-bold text-mx-neon">✓ {t.winIf}</span>
          <span className="text-base font-semibold text-ink">{need.text}</span>
        </div>
        {need.push && (
          <div className="mt-0.5 text-sm text-muted">↩ {need.push}</div>
        )}
      </div>

      {suspended && (
        <p className="mt-3 text-center text-base text-muted">⏸ {t.suspended}</p>
      )}

      {/* Stake */}
      <label className="mt-5 block text-base text-muted">{t.yourStake}</label>
      <input
        className="font-display mt-1 w-full rounded-lg border border-border bg-raised p-4 text-3xl text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
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
            className="rounded-full border border-border px-4 py-3 text-base font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
            onClick={() => changeStake(c)}
          >
            {c >= 1_000_000 ? `${c / 1_000_000}M` : `${c / 1_000}k`}
          </button>
        ))}
      </div>

      {/* Plain-MMK payout */}
      {p && (
        <div className="my-4 space-y-1.5 rounded-lg bg-surface p-3">
          <div className="flex items-center justify-between">
            <span className="text-base text-muted">{t.ifWin}</span>
            <span className="font-display text-xl text-mx-neon">
              +{mmk(p.winNet)}
            </span>
          </div>
          {p.showPush && (
            <div className="flex items-center justify-between">
              <span className="text-base text-muted">{t.ifPush}</span>
              <span className="text-base font-semibold text-muted">
                {mmk(stake)}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-base text-muted">{t.ifLose}</span>
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
          armed ? "bg-mx" : "bg-us"
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
        <p className="mt-2 text-center text-sm text-muted">
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
      className="flex items-center gap-1 text-base font-semibold text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
    >
      <span aria-hidden>←</span> {label}
    </button>
  );
}

export default function PracticeBetPage() {
  // useSearchParams must sit under a Suspense boundary for the production build.
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-canvas p-4 text-center text-muted">
          …
        </main>
      }
    >
      <PracticeBetInner />
    </Suspense>
  );
}
