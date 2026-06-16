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
  const [busy, setBusy] = useState(false);

  const reload = () =>
    api<TicketRow[]>("/api/bets")
      .then(setTickets)
      .catch((e) => {
        if (!redirectIfPinChange(e)) setError(errMsg(t, e));
      });

  useEffect(() => {
    reload();
  }, []); // run once on mount

  // Offer Cancel while the bet is plausibly still cancellable: pending and the
  // match hasn't kicked off. The server enforces the real guards (within the
  // window, line unchanged) and returns a clear message if it's too late.
  function canCancel(b: TicketRow): boolean {
    return (
      b.status === "pending" &&
      b.match.status === "scheduled" &&
      (b.cancelWindowSeconds ?? 0) > 0
    );
  }

  async function cancelBet(b: TicketRow) {
    if (!window.confirm(t.cancelConfirm)) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/bets", { action: "cancel", ticketNo: b.ticketNo });
      setSelected(null);
      await reload();
    } catch (e) {
      setError(errMsg(t, e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="p-3">
      {error && <p className="mt-8 text-center text-sm text-ca">{error}</p>}
      {tickets.length === 0 && !error && (
        <p className="mt-8 text-center text-ink/40">{t.noBets}</p>
      )}
      {tickets.map((b) => (
        <button
          key={b.ticketNo}
          className="mb-2 w-full rounded-xl border border-ink/10 bg-white p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
          onClick={() => setSelected(b)}
        >
          <div className="flex items-center justify-between">
            <span className="font-display text-xl font-bold text-ink">
              {b.ticketNo}
            </span>
            <span
              className={`rounded-full px-3 py-1 text-sm font-bold ${STATUS_COLORS[b.status] ?? "bg-gray-100 text-gray-600"}`}
            >
              {t[statusKey(b.status)]}
            </span>
          </div>
          <div className="mt-1 text-base text-ink/60">
            {b.match.homeTeam} vs {b.match.awayTeam} ·{" "}
            {b.side === "fav"
              ? t.sideFav
              : b.side === "dog"
                ? t.sideDog
                : b.side === "over"
                  ? t.over
                  : t.under}
          </div>
          <div className="text-base text-ink/50">
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
              className="mb-3 py-2 text-base text-ink/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
              onClick={() => setSelected(null)}
            >
              ✕ {t.close}
            </button>
            <TicketCard ticket={selected} />
            {canCancel(selected) && (
              <button
                disabled={busy}
                onClick={() => cancelBet(selected)}
                className="mt-4 w-full rounded-xl border-2 border-ca py-3 text-base font-bold text-ca focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ca disabled:opacity-50"
              >
                {busy ? "…" : t.cancelBet}
              </button>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
