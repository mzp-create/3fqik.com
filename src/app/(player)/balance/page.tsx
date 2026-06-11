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
  side: "fav" | "dog";
  stakeMmk: number;
  status: string;
  netMmk: number | null;
  settlementId: number | null;
  favSide: "home" | "away";
  ballQ: number;
  priceC: number;
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
  open: "bg-green-100 text-green-800",
  closed: "bg-yellow-100 text-yellow-800",
  settled: "bg-gray-100 text-gray-600",
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
      {error && <p className="mt-8 text-center text-red-600">{error}</p>}
      {days.length === 0 && !error && (
        <p className="mt-8 text-center text-gray-400">{t.noDays}</p>
      )}
      {days.map((day) => {
        const net = day.items.reduce((s, i) => s + (i.netMmk ?? 0), 0);
        const dayStatusLabel =
          day.status === "open"
            ? t.dayOpen
            : day.status === "closed"
              ? t.dayClosed
              : t.daySettled;

        return (
          <section key={day.date} className="mb-4 rounded-xl border p-3">
            <div className="flex items-center justify-between">
              <h2 className="font-bold">{day.date}</h2>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${DAY_STATUS_COLORS[day.status]}`}
              >
                {dayStatusLabel}
              </span>
            </div>
            <div
              className={`mt-1 text-lg font-bold ${net > 0 ? "text-green-700" : net < 0 ? "text-red-600" : "text-gray-600"}`}
            >
              {net === 0
                ? t.evenDay
                : net > 0
                  ? `${t.housePays}: ${mmk(net)} MMK`
                  : `${t.youPay}: ${mmk(-net)} MMK`}
            </div>
            {day.ref && (
              <p className="text-xs text-gray-500">
                {t.settledRef} · {day.ref}
              </p>
            )}
            {!day.ref && day.status !== "settled" && (
              <p className="text-xs text-gray-400">{t.unsettled}</p>
            )}
            <ul className="mt-2 divide-y text-sm">
              {day.items.map((item) => {
                const fav =
                  item.favSide === "home" ? item.homeTeam : item.awayTeam;
                const dog =
                  item.favSide === "home" ? item.awayTeam : item.homeTeam;
                const pickStr =
                  item.side === "fav"
                    ? `${fav} −${ball(item.ballQ)} @ ${price(item.priceC)}`
                    : `${dog} +${ball(item.ballQ)} @ ${price(item.priceC)}`;
                return (
                  <li key={item.id} className="py-2">
                    <div className="flex justify-between">
                      <span className="font-mono text-xs text-gray-500">
                        {item.ticketNo}
                      </span>
                      <span className="text-xs font-semibold uppercase">
                        {t[statusKey(item.status)]}
                      </span>
                    </div>
                    <div className="text-gray-700">{pickStr}</div>
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>
                        {t.stake}: {mmk(item.stakeMmk)} MMK
                      </span>
                      {item.netMmk != null && (
                        <span
                          className={
                            item.netMmk > 0
                              ? "text-green-700"
                              : item.netMmk < 0
                                ? "text-red-600"
                                : ""
                          }
                        >
                          {t.net}: {signedMmk(item.netMmk)} MMK
                        </span>
                      )}
                    </div>
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
