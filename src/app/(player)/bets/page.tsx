"use client";
import { useEffect, useState } from "react";
import { api, redirectIfPinChange } from "@/lib/client/api";
import { useT } from "@/lib/i18n";
import { errMsg } from "@/lib/client/errMsg";
import { statusKey } from "@/lib/client/status";
import { TicketCard, type TicketRow } from "@/components/TicketCard";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-500",
  won: "bg-mx/10 text-mx",
  half_won: "bg-mx/10 text-mx",
  push: "bg-gray-100 text-gray-500",
  half_lost: "bg-ca/10 text-ca",
  lost: "bg-ca/10 text-ca",
  void: "bg-gray-100 text-gray-400",
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
      {error && <p className="mt-8 text-center text-sm text-ca">{error}</p>}
      {tickets.length === 0 && !error && (
        <p className="mt-8 text-center text-ink/40">{t.noBets}</p>
      )}
      {tickets.map((b) => (
        <button
          key={b.ticketNo}
          className="mb-2 w-full rounded-xl border border-ink/10 bg-white p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
          onClick={() => setSelected(b)}
        >
          <div className="flex items-center justify-between">
            <span className="font-mono text-sm font-bold text-ink">
              {b.ticketNo}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[b.status] ?? "bg-gray-100 text-gray-600"}`}
            >
              {t[statusKey(b.status)]}
            </span>
          </div>
          <div className="mt-1 text-sm text-ink/60">
            {b.match.homeTeam} vs {b.match.awayTeam} ·{" "}
            {b.side === "fav"
              ? t.sideFav
              : b.side === "dog"
                ? t.sideDog
                : b.side === "over"
                  ? t.over
                  : t.under}
          </div>
          <div className="text-sm text-ink/50">
            {t.stake}: {b.stakeMmk.toLocaleString("en-US")} MMK
          </div>
        </button>
      ))}

      {selected && (
        <div
          className="fixed inset-0 z-20 bg-ink/50"
          onClick={() => setSelected(null)}
        >
          <div
            className="fixed bottom-0 left-0 right-0 mx-auto max-w-md overflow-y-auto rounded-t-2xl bg-white p-4 pb-8"
            style={{ maxHeight: "90vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="mb-3 text-sm text-ink/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
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
