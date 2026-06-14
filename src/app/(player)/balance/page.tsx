"use client";
import { useEffect, useState } from "react";
import { api, redirectIfPinChange } from "@/lib/client/api";
import { useT } from "@/lib/i18n";
import { errMsg } from "@/lib/client/errMsg";
import { statusKey } from "@/lib/client/status";
import { signedMmk, mmk, ball, price } from "@/lib/client/format";

type BalanceItem = {
  id: number;
  ticketNo: string;
  side: "fav" | "dog" | "over" | "under";
  stakeMmk: number;
  status: string;
  netMmk: number | null;
  feeMmk: number | null;
  settlementId: number | null;
  favSide: "home" | "away";
  ballQ: number;
  priceC: number;
  market: "ah" | "ou";
  homeTeam: string;
  awayTeam: string;
};

type BalanceDay = {
  date: string;
  status: "open" | "closed" | "settled";
  ref: string | null;
  items: BalanceItem[];
};

const DAY_STATUS_COLORS = {
  open: "border border-us text-us",
  closed: "border border-ca text-ca",
  settled: "bg-mx text-white",
};

export default function BalancePage() {
  const { t } = useT();
  const [days, setDays] = useState<BalanceDay[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api<BalanceDay[]>("/api/balance")
      .then(setDays)
      .catch((e) => {
        if (!redirectIfPinChange(e)) setError(errMsg(t, e));
      });
  }, []);

  return (
    <main className="p-3">
      {error && <p className="mt-8 text-center text-sm text-ca">{error}</p>}
      {days.length === 0 && !error && (
        <p className="mt-8 text-center text-ink/40">{t.noDays}</p>
      )}
      {days.map((day) => {
        // effective net = net + fee for each item
        const net = day.items.reduce(
          (s, i) => s + (i.netMmk ?? 0) + (i.feeMmk ?? 0),
          0,
        );
        const dayStatusLabel =
          day.status === "open"
            ? t.dayOpen
            : day.status === "closed"
              ? t.dayClosed
              : t.daySettled;

        return (
          <section
            key={day.date}
            className="mb-4 rounded-xl border border-ink/10 bg-white p-4"
          >
            {/* Section header with triband accent */}
            <div className="mb-1 flex items-center gap-2">
              <div
                className="triband-skew"
                style={{ height: "14px", width: "4px" }}
              />
              <div className="flex flex-1 items-center justify-between">
                <h2 className="text-base font-bold text-ink">{day.date}</h2>
                <span
                  className={`rounded-full px-3 py-1 text-sm font-bold ${DAY_STATUS_COLORS[day.status]}`}
                >
                  {dayStatusLabel}
                </span>
              </div>
            </div>

            <div
              className={`mt-1 font-display text-3xl ${net > 0 ? "text-mx" : net < 0 ? "text-ca" : "text-gray-500"}`}
            >
              {net === 0
                ? t.evenDay
                : net > 0
                  ? `${t.housePays}: ${mmk(net)} MMK`
                  : `${t.youPay}: ${mmk(-net)} MMK`}
            </div>

            {day.ref && (
              <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-gold/20 px-3 py-1 text-sm font-bold text-ink">
                <span className="text-gold">●</span>
                {t.settledRef} · {day.ref}
              </p>
            )}
            {!day.ref && day.status !== "settled" && (
              <p className="text-sm text-ink/40">{t.unsettled}</p>
            )}

            <ul className="mt-2 divide-y divide-ink/5">
              {day.items.map((item) => {
                let pickStr: string;
                if (item.market === "ou") {
                  const word = item.side === "over" ? t.over : t.under;
                  pickStr = `${word} ${ball(item.ballQ)} @ ${price(item.priceC)}`;
                } else {
                  const fav =
                    item.favSide === "home" ? item.homeTeam : item.awayTeam;
                  const dog =
                    item.favSide === "home" ? item.awayTeam : item.homeTeam;
                  pickStr =
                    item.side === "fav"
                      ? `${fav} −${ball(item.ballQ)} @ ${price(item.priceC)}`
                      : `${dog} +${ball(item.ballQ)} @ ${price(item.priceC)}`;
                }
                const fee = item.feeMmk ?? 0;
                const effectiveNet = (item.netMmk ?? 0) + fee;
                return (
                  <li key={item.id} className="py-2">
                    <div className="flex justify-between">
                      <span className="font-mono text-sm font-bold text-ink/40">
                        {item.ticketNo}
                      </span>
                      <span className="text-sm font-bold uppercase text-ink/60">
                        {t[statusKey(item.status)]}
                      </span>
                    </div>
                    <div className="text-base text-ink/80">{pickStr}</div>
                    <div className="flex justify-between text-sm text-ink/50">
                      <span>
                        {t.stake}: {mmk(item.stakeMmk)} MMK
                      </span>
                      {item.netMmk != null && (
                        <span
                          className={`font-display ${
                            item.netMmk > 0
                              ? "text-mx"
                              : item.netMmk < 0
                                ? "text-ca"
                                : "text-gray-500"
                          }`}
                        >
                          {t.net}: {signedMmk(item.netMmk)} MMK
                        </span>
                      )}
                    </div>
                    {fee !== 0 && item.netMmk != null && (
                      <div className="flex justify-between text-xs text-ink/40 mt-0.5">
                        <span>
                          {fee < 0
                            ? `Commission −${mmk(Math.abs(fee))} MMK`
                            : `Discount +${mmk(fee)} MMK`}
                        </span>
                        <span
                          className={`font-semibold ${effectiveNet >= 0 ? "text-mx" : "text-ca"}`}
                        >
                          Net after fee: {signedMmk(effectiveNet)} MMK
                        </span>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </main>
  );
}
