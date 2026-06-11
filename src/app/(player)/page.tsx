"use client";
import { useEffect, useState } from "react";
import { api, redirectIfPinChange } from "@/lib/client/api";
import { useSse } from "@/lib/client/useSse";
import { MatchCard, type MatchRow } from "@/components/MatchCard";
import { BetSlip, type SlipState } from "@/components/BetSlip";

export default function MatchesPage() {
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [slip, setSlip] = useState<SlipState | null>(null);

  const reload = () =>
    api<MatchRow[]>("/api/matches")
      .then(setMatches)
      .catch((e) => redirectIfPinChange(e));
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
      {today.map((m) => (
        <MatchCard
          key={m.id}
          match={m}
          onPick={(side) => m.line && setSlip({ match: m, line: m.line, side })}
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
