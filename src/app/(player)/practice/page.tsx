"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, redirectIfPinChange } from "@/lib/client/api";
import { useT } from "@/lib/i18n";
import { errMsg } from "@/lib/client/errMsg";
import { mmk, ball, priceSigned } from "@/lib/client/format";
import { teamLabel } from "@/lib/client/flags";
import { MatchCard, type MatchRow } from "@/components/MatchCard";
import { usePractice, type DemoBet } from "@/lib/client/practice";

/** Sticky PRACTICE banner shown at the top of every practice screen. */
function PracticeBanner({ banner }: { banner: string }) {
  return (
    <div className="sticky top-0 z-20 -mx-3 mb-3 bg-canvas/95 px-3 py-2 backdrop-blur">
      <div className="rounded-lg border border-gold/30 bg-gold/15 px-3 py-2 text-center text-base font-bold uppercase tracking-wide text-gold">
        {banner}
      </div>
    </div>
  );
}

export default function PracticePage() {
  const { t } = useT();
  const router = useRouter();
  const { balanceMmk, bets, inPlayMmk, simulate, reset } = usePractice();
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [error, setError] = useState("");
  // Render localStorage-backed values only after mount to avoid a hydration
  // flash: the server snapshot is `false`, the client snapshot `true`.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  useEffect(() => {
    api<MatchRow[]>("/api/matches")
      .then(setMatches)
      .catch((e) => {
        if (!redirectIfPinChange(e)) setError(errMsg(t, e));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const board = matches.filter((m) => m.status !== "finished");
  // Most recent first.
  const ticketList = [...bets].reverse();

  return (
    <main className="p-3">
      <PracticeBanner banner={t.practiceBanner} />

      {/* Balance / in-play summary + exit */}
      <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3 py-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm text-muted">{t.practiceBalance}</span>
          <span className="font-display text-2xl text-ink">
            {mounted ? mmk(balanceMmk) : "—"}
          </span>
        </div>
        <div className="flex flex-col gap-0.5 text-right">
          <span className="text-sm text-muted">{t.practiceInPlay}</span>
          <span className="font-display text-2xl text-ink">
            {mounted ? mmk(inPlayMmk) : "—"}
          </span>
        </div>
        <Link
          href="/"
          className="rounded-lg border border-border px-3 py-2 text-base font-semibold text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
        >
          {t.practiceExit}
        </Link>
      </div>

      {error && <p className="mt-2 text-center text-base text-ca">{error}</p>}

      {/* Practice board — pick a side to open the practice bet page */}
      <p className="mb-2 text-base text-muted">{t.practiceTry}</p>
      {board.map((m) => (
        <MatchCard
          key={m.id}
          match={m}
          onPick={(market, side) =>
            router.push(`/practice/bet/${m.id}?market=${market}&side=${side}`)
          }
        />
      ))}

      {/* Practice tickets */}
      <h2 className="mb-2 mt-6 font-display text-lg text-ink">
        {t.practiceTitle}
      </h2>
      {!mounted ? null : ticketList.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-surface px-4 py-8 text-center text-base text-faint">
          {t.practiceNote}
        </p>
      ) : (
        <ul className="space-y-2">
          {ticketList.map((b) => (
            <TicketRow
              key={b.id}
              bet={b}
              onSimulate={() => simulate(b.id)}
              t={t}
            />
          ))}
        </ul>
      )}

      {/* Reset practice */}
      {mounted && ticketList.length > 0 && (
        <button
          onClick={reset}
          className="mt-4 w-full rounded-lg border border-border py-3 text-base font-semibold text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
        >
          {t.practiceReset}
        </button>
      )}
    </main>
  );
}

function TicketRow({
  bet: b,
  onSimulate,
  t,
}: {
  bet: DemoBet;
  onSimulate: () => void;
  t: ReturnType<typeof useT>["t"];
}) {
  const fav = b.favSide === "home" ? b.homeTeam : b.awayTeam;
  const dog = b.favSide === "home" ? b.awayTeam : b.homeTeam;
  // Plain-language pick: side + ball + signed price.
  let pick: string;
  if (b.market === "ou") {
    const word = b.side === "over" ? t.over : t.under;
    pick = `${word} ${ball(b.ballQ)} ${priceSigned(b.priceC)}`;
  } else if (b.side === "fav") {
    pick = `${teamLabel(fav)} −${ball(b.ballQ)} ${priceSigned(b.priceC)}`;
  } else {
    pick = `${teamLabel(dog)} +${ball(b.ballQ)} ${priceSigned(b.priceC)}`;
  }

  const resultTone =
    b.status === "won"
      ? "text-mx-neon"
      : b.status === "lost"
        ? "text-ca"
        : "text-muted";
  const resultLabel =
    b.status === "won"
      ? t.practiceResultWon
      : b.status === "lost"
        ? t.practiceResultLost
        : t.practiceResultPush;

  return (
    <li className="rounded-xl border border-border bg-surface p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-base font-semibold text-ink">
          {teamLabel(b.homeTeam)} vs {teamLabel(b.awayTeam)}
        </span>
        <span className="font-display text-base text-ink">
          {mmk(b.stakeMmk)}
        </span>
      </div>
      <div className="mt-0.5 text-sm text-muted">{pick}</div>

      {b.status === "pending" ? (
        <button
          onClick={onSimulate}
          className="mt-3 w-full rounded-lg bg-mx py-3 text-base font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
        >
          {t.practiceSimulate}
        </button>
      ) : (
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className={`text-base font-bold ${resultTone}`}>
            {resultLabel}
          </span>
          <span className="text-sm text-muted">
            {b.simHome}–{b.simAway}
          </span>
          <span className={`font-display text-base ${resultTone}`}>
            {b.netMmk != null
              ? (b.netMmk > 0 ? "+" : b.netMmk < 0 ? "−" : "") +
                mmk(Math.abs(b.netMmk))
              : "—"}
          </span>
        </div>
      )}
    </li>
  );
}
