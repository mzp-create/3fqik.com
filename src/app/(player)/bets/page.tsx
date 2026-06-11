"use client";
import { useEffect, useState } from "react";
import { api, redirectIfPinChange } from "@/lib/client/api";
import { useT } from "@/lib/i18n";
import { errMsg } from "@/lib/client/errMsg";
import { statusKey } from "@/lib/client/status";
import { TicketCard, type TicketRow } from "@/components/TicketCard";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  won: "bg-green-100 text-green-800",
  half_won: "bg-green-50 text-green-700",
  push: "bg-gray-100 text-gray-600",
  half_lost: "bg-red-50 text-red-700",
  lost: "bg-red-100 text-red-800",
  void: "bg-gray-200 text-gray-500",
};

export default function BetsPage() {
  const { t } = useT();
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [selected, setSelected] = useState<TicketRow | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<TicketRow[]>("/api/bets")
      .then(setTickets)
      .catch((e) => {
        if (!redirectIfPinChange(e)) setError(errMsg(t, e));
      });
  }, []);

  return (
    <main className="p-3">
      {error && <p className="mt-8 text-center text-red-600">{error}</p>}
      {tickets.length === 0 && !error && (
        <p className="mt-8 text-center text-gray-400">{t.noBets}</p>
      )}
      {tickets.map((b) => (
        <button
          key={b.ticketNo}
          className="mb-2 w-full rounded-xl border p-3 text-left"
          onClick={() => setSelected(b)}
        >
          <div className="flex items-center justify-between">
            <span className="font-mono text-sm font-bold">{b.ticketNo}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[b.status] ?? "bg-gray-100 text-gray-600"}`}
            >
              {t[statusKey(b.status)]}
            </span>
          </div>
          <div className="mt-1 text-sm text-gray-600">
            {b.match.homeTeam} vs {b.match.awayTeam} ·{" "}
            {b.side === "fav" ? t.sideFav : t.sideDog}
          </div>
          <div className="text-sm text-gray-500">
            {t.stake}: {b.stakeMmk.toLocaleString("en-US")} MMK
          </div>
        </button>
      ))}

      {selected && (
        <div
          className="fixed inset-0 z-20 bg-black/50"
          onClick={() => setSelected(null)}
        >
          <div
            className="fixed bottom-0 left-0 right-0 mx-auto max-w-md overflow-y-auto rounded-t-2xl bg-white p-4 pb-8"
            style={{ maxHeight: "90vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="mb-3 text-sm text-gray-400"
              onClick={() => setSelected(null)}
            >
              ✕ {t.close}
            </button>
            <TicketCard ticket={selected} />
          </div>
        </div>
      )}
    </main>
  );
}
