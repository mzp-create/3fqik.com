"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { mmk, signedMmk } from "@/lib/client/format";

type MatchVolume = {
  matchId: number;
  stakeVolume: number;
  betCount: number;
};

type DashData = {
  todayHouseNet: number;
  tournamentHouseNet: number;
  todayStakeVolume: number;
  todayBetCount: number;
  activePlayers: number;
  matches: MatchVolume[];
  outstanding: {
    toPayMmk: number;
    toCollectMmk: number;
    payCount: number;
    collectCount: number;
  };
};

type MatchRow = {
  id: number;
  homeTeam: string;
  awayTeam: string;
  status: string;
};

export default function AdminDashboard() {
  const [data, setData] = useState<DashData | null>(null);
  const [matchMap, setMatchMap] = useState<Record<number, MatchRow>>({});
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      api<DashData>("/api/admin/dashboard"),
      api<MatchRow[]>("/api/matches"),
    ])
      .then(([dash, matches]) => {
        setData(dash);
        const map: Record<number, MatchRow> = {};
        for (const m of matches) map[m.id] = m;
        setMatchMap(map);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "error"));
  }, []);

  if (error) return <p className="text-red-600">{error}</p>;
  if (!data) return <p className="text-gray-500">Loading…</p>;

  const houseNetClass = (n: number) =>
    n >= 0 ? "text-green-700 font-bold" : "text-red-600 font-bold";

  return (
    <main>
      <h1 className="mb-4 text-lg font-bold">Admin Overview</h1>

      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="rounded border p-3">
          <div className="text-xs text-gray-500 mb-1">Today House Net</div>
          <div className={houseNetClass(data.todayHouseNet)}>
            {signedMmk(data.todayHouseNet)}
          </div>
        </div>
        <div className="rounded border p-3">
          <div className="text-xs text-gray-500 mb-1">Tournament Net</div>
          <div className={houseNetClass(data.tournamentHouseNet)}>
            {signedMmk(data.tournamentHouseNet)}
          </div>
        </div>
        <div className="rounded border p-3">
          <div className="text-xs text-gray-500 mb-1">Today Volume</div>
          <div className="font-semibold">{mmk(data.todayStakeVolume)}</div>
        </div>
        <div className="rounded border p-3">
          <div className="text-xs text-gray-500 mb-1">Bets / Players</div>
          <div className="font-semibold">
            {data.todayBetCount} / {data.activePlayers}
          </div>
        </div>
      </div>

      <div className="rounded border p-3 mb-6">
        <div className="text-xs text-gray-500 mb-2 font-semibold uppercase tracking-wide">
          Outstanding Settlements
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div>
            <div className="text-xs text-gray-500 mb-0.5">To pay out</div>
            <div className="text-green-700 font-bold">
              {mmk(data.outstanding.toPayMmk)} MMK
            </div>
            <div className="text-xs text-gray-400">
              ({data.outstanding.payCount} settlement
              {data.outstanding.payCount !== 1 ? "s" : ""})
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-0.5">To collect</div>
            <div className="text-red-600 font-bold">
              {mmk(data.outstanding.toCollectMmk)} MMK
            </div>
            <div className="text-xs text-gray-400">
              ({data.outstanding.collectCount} settlement
              {data.outstanding.collectCount !== 1 ? "s" : ""})
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-0.5">Net position</div>
            <div
              className={
                data.outstanding.toCollectMmk - data.outstanding.toPayMmk >= 0
                  ? "text-green-700 font-bold"
                  : "text-red-600 font-bold"
              }
            >
              {signedMmk(
                data.outstanding.toCollectMmk - data.outstanding.toPayMmk,
              )}{" "}
              MMK
            </div>
            <div className="text-xs text-gray-400">
              (positive = house ahead)
            </div>
          </div>
        </div>
      </div>

      {data.matches.length > 0 && (
        <>
          <h2 className="mb-2 font-semibold">Today Match Volume</h2>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="py-1 pr-2">Match</th>
                <th className="py-1 pr-2 text-right">Volume</th>
                <th className="py-1 text-right">Bets</th>
              </tr>
            </thead>
            <tbody>
              {data.matches.map((m) => {
                const match = matchMap[m.matchId];
                const label = match
                  ? `${match.homeTeam} v ${match.awayTeam}`
                  : `Match #${m.matchId}`;
                return (
                  <tr key={m.matchId} className="border-b last:border-0">
                    <td className="py-1 pr-2">{label}</td>
                    <td className="py-1 pr-2 text-right">
                      {mmk(m.stakeVolume)}
                    </td>
                    <td className="py-1 text-right">{m.betCount}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </main>
  );
}
