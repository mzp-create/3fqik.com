"use client";
import { useEffect, useState } from "react";
import { api, redirectIfPinChange } from "@/lib/client/api";
import { useSse } from "@/lib/client/useSse";
import { useT } from "@/lib/i18n";
import { errMsg } from "@/lib/client/errMsg";
import { MatchCard, type MatchRow } from "@/components/MatchCard";
import { BetSlip, type SlipState } from "@/components/BetSlip";

export default function MatchesPage() {
  const { t } = useT();
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [slip, setSlip] = useState<SlipState | null>(null);
  const [error, setError] = useState("");

  const reload = () =>
    api<MatchRow[]>("/api/matches")
      .then(setMatches)
      .catch((e) => {
        if (!redirectIfPinChange(e)) setError(errMsg(t, e));
      });
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

  const today = matches.filter((m) => m.status !== "finished");
  return (
    <main className="p-3">
      {error && <p className="mt-8 text-center text-red-600">{error}</p>}
      {today.map((m) => (
        <MatchCard
          key={m.id}
          match={m}
          onPick={(market, side) => {
            const line = market === "ou" ? m.ouLine : m.line;
            if (line) setSlip({ match: m, line, side, market });
          }}
        />
      ))}
      {slip && (
        <BetSlip
          slip={slip}
          onClose={() => setSlip(null)}
          onPlaced={() => {
            setSlip(null);
            reload();
          }}
        />
      )}
    </main>
  );
}
