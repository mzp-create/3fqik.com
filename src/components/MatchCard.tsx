"use client";
import { useT } from "@/lib/i18n";
import { ball, price } from "@/lib/client/format";

export type LineRow = {
  id: number;
  version: number;
  favSide: "home" | "away";
  ballQ: number;
  priceC: number;
  status: string;
};
export type MatchRow = {
  id: number;
  stage: string;
  homeTeam: string;
  awayTeam: string;
  kickoffUtc: string;
  status: "scheduled" | "live" | "finished";
  homeScore: number | null;
  awayScore: number | null;
  line: LineRow | null;
};

export function MatchCard({
  match: m,
  onPick,
}: {
  match: MatchRow;
  onPick: (side: "fav" | "dog") => void;
}) {
  const { t } = useT();
  const l = m.line;
  const fav = l?.favSide === "home" ? m.homeTeam : m.awayTeam;
  const dog = l?.favSide === "home" ? m.awayTeam : m.homeTeam;
  const kickoff = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Yangon",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(m.kickoffUtc));

  return (
    <div
      className={`mb-3 rounded-xl border p-3 ${l?.status === "suspended" ? "opacity-50" : ""}`}
    >
      <div className="flex justify-between text-sm">
        <span className="font-semibold">
          {m.homeTeam} vs {m.awayTeam}{" "}
          <span className="text-gray-400">· {m.stage}</span>
        </span>
        {m.status === "live" ? (
          <span className="font-bold text-red-600">
            ● {t.live} {m.homeScore}–{m.awayScore}
          </span>
        ) : (
          <span className="text-gray-500">{kickoff}</span>
        )}
      </div>
      {!l && <p className="mt-2 text-center text-sm text-gray-400">—</p>}
      {l && l.status === "suspended" && (
        <p className="mt-2 text-center text-sm">⏸ {t.suspended}</p>
      )}
      {l && l.status === "active" && (
        <div className="mt-2 flex gap-2">
          <button
            className="flex-1 rounded-lg bg-green-50 p-3 font-semibold"
            onClick={() => onPick("fav")}
          >
            {fav} −{ball(l.ballQ)}
            <br />
            <span className="text-green-700">{price(l.priceC)}</span>
          </button>
          <button
            className="flex-1 rounded-lg bg-blue-50 p-3 font-semibold"
            onClick={() => onPick("dog")}
          >
            {dog} +{ball(l.ballQ)}
            <br />
            <span className="text-blue-700">{price(l.priceC)}</span>
          </button>
        </div>
      )}
    </div>
  );
}
