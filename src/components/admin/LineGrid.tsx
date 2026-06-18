"use client";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { ball, price, dayLabel } from "@/lib/client/format";

type Line = {
  favSide: "home" | "away";
  ballQ: number;
  priceC: number;
  status: "active" | "suspended" | "closed";
  market: "ah" | "ou";
  offeredSide: "fav" | "dog" | "over" | "under";
};
export type GridMatch = {
  id: number;
  homeTeam: string;
  awayTeam: string;
  status: "scheduled" | "live" | "finished";
  matchDay: string;
  line: Line | null;
  ouLine: Line | null;
};

type AhInput = {
  favSide: "home" | "away";
  offeredSide: "fav" | "dog";
  ball: string;
  price: string;
};
type OuInput = { offeredSide: "over" | "under"; goals: string; price: string };

function seedAh(line: Line | null): AhInput {
  return line
    ? {
        favSide: line.favSide,
        offeredSide:
          line.offeredSide === "dog" || line.offeredSide === "fav"
            ? line.offeredSide
            : "fav",
        ball: ball(line.ballQ),
        price: price(line.priceC),
      }
    : { favSide: "home", offeredSide: "fav", ball: "", price: "" };
}
function seedOu(line: Line | null): OuInput {
  return line
    ? {
        offeredSide:
          line.offeredSide === "under" || line.offeredSide === "over"
            ? line.offeredSide
            : "over",
        goals: ball(line.ballQ),
        price: price(line.priceC),
      }
    : { offeredSide: "over", goals: "", price: "" };
}

/** Parse a ball/goals string to ballQ (×4); null if invalid or out of range. */
function parseBall(v: string, market: "ah" | "ou"): number | null {
  const f = parseFloat(v);
  if (isNaN(f)) return null;
  const q = Math.round(f * 4);
  if (Math.abs(f * 4 - q) > 1e-9) return null; // not a multiple of 0.25
  const min = market === "ou" ? 1 : 0;
  return q >= min && q <= 40 ? q : null;
}
/** Parse a signed price string to priceC (×100); null if invalid/out of range/0. */
function parsePrice(v: string): number | null {
  const f = parseFloat(v);
  if (isNaN(f)) return null;
  const c = Math.round(f * 100);
  return c !== 0 && c >= -100 && c <= 100 ? c : null;
}

// Sign helpers — the mobile numeric keypad has no minus key, so a +/− toggle
// manages the sign while the input takes the magnitude.
const isNeg = (s: string) => s.trim().startsWith("-");
const magOf = (s: string) => s.replace(/^-/, "");
const withSign = (neg: boolean, mag: string) =>
  (neg ? "-" : "") + mag.replace(/[^0-9.]/g, "");
const flipSign = (s: string) =>
  s.trim().startsWith("-") ? s.trim().slice(1) : "-" + s.trim();

type Result = { matchId: number; market: string; ok: boolean; error?: string };

export function LineGrid({
  matches,
  today,
  tomorrow,
  onSaved,
}: {
  matches: GridMatch[];
  today: string;
  tomorrow: string;
  onSaved: () => void;
}) {
  const [ah, setAh] = useState<Record<number, AhInput>>({});
  const [ou, setOu] = useState<Record<number, OuInput>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  // Inputs are derived: an untouched row shows its current line (via seedAh/
  // seedOu); state only holds rows the admin has edited. This preserves
  // in-progress edits across SSE reloads with no setState-in-effect.
  const ahOf = (m: GridMatch): AhInput => ah[m.id] ?? seedAh(m.line);
  const ouOf = (m: GridMatch): OuInput => ou[m.id] ?? seedOu(m.ouLine);

  const sorted = [...matches].sort((a, b) =>
    a.matchDay !== b.matchDay
      ? a.matchDay.localeCompare(b.matchDay)
      : a.id - b.id,
  );

  function reseed(ids: number[]) {
    // After a save, drop saved rows so they re-seed from fresh server data.
    setAh((prev) => {
      const next = { ...prev };
      for (const id of ids) delete next[id];
      return next;
    });
    setOu((prev) => {
      const next = { ...prev };
      for (const id of ids) delete next[id];
      return next;
    });
  }

  async function saveAh() {
    setErr("");
    setMsg("");
    const lines: Array<{
      matchId: number;
      market: "ah";
      favSide: "home" | "away";
      offeredSide: "fav" | "dog";
      ballQ: number;
      priceC: number;
    }> = [];
    const bad: string[] = [];
    for (const m of matches) {
      const f = ahOf(m);
      const both = f.ball.trim() !== "" && f.price.trim() !== "";
      const some = f.ball.trim() !== "" || f.price.trim() !== "";
      if (!some) continue; // untouched row
      if (!both) {
        bad.push(`${m.homeTeam} v ${m.awayTeam}: fill both ball and price`);
        continue;
      }
      const ballQ = parseBall(f.ball, "ah");
      const priceC = parsePrice(f.price);
      if (ballQ === null)
        bad.push(`${m.homeTeam} v ${m.awayTeam}: invalid ball "${f.ball}"`);
      else if (priceC === null)
        bad.push(`${m.homeTeam} v ${m.awayTeam}: invalid price "${f.price}"`);
      else {
        const cur = m.line;
        const dirty =
          !cur ||
          cur.ballQ !== ballQ ||
          cur.priceC !== priceC ||
          cur.favSide !== f.favSide ||
          cur.offeredSide !== f.offeredSide;
        if (dirty)
          lines.push({
            matchId: m.id,
            market: "ah",
            favSide: f.favSide,
            offeredSide: f.offeredSide,
            ballQ,
            priceC,
          });
      }
    }
    if (bad.length) return setErr(bad.join(" · "));
    if (!lines.length) return setMsg("No handicap changes to save.");
    await submit(
      lines,
      lines.map((l) => l.matchId),
    );
  }

  async function saveOu() {
    setErr("");
    setMsg("");
    const lines: Array<{
      matchId: number;
      market: "ou";
      offeredSide: "over" | "under";
      ballQ: number;
      priceC: number;
    }> = [];
    const bad: string[] = [];
    for (const m of matches) {
      const f = ouOf(m);
      const both = f.goals.trim() !== "" && f.price.trim() !== "";
      const some = f.goals.trim() !== "" || f.price.trim() !== "";
      if (!some) continue;
      if (!both) {
        bad.push(`${m.homeTeam} v ${m.awayTeam}: fill both goals and price`);
        continue;
      }
      const ballQ = parseBall(f.goals, "ou");
      const priceC = parsePrice(f.price);
      if (ballQ === null)
        bad.push(`${m.homeTeam} v ${m.awayTeam}: invalid goals "${f.goals}"`);
      else if (priceC === null)
        bad.push(`${m.homeTeam} v ${m.awayTeam}: invalid price "${f.price}"`);
      else {
        const cur = m.ouLine;
        const dirty =
          !cur ||
          cur.ballQ !== ballQ ||
          cur.priceC !== priceC ||
          cur.offeredSide !== f.offeredSide;
        if (dirty)
          lines.push({
            matchId: m.id,
            market: "ou",
            offeredSide: f.offeredSide,
            ballQ,
            priceC,
          });
      }
    }
    if (bad.length) return setErr(bad.join(" · "));
    if (!lines.length) return setMsg("No goals changes to save.");
    await submit(
      lines,
      lines.map((l) => l.matchId),
    );
  }

  async function submit(lines: unknown[], ids: number[]) {
    setBusy(true);
    try {
      const { results } = await api<{ results: Result[] }>("/api/admin/lines", {
        action: "post_bulk",
        lines,
      });
      const okN = results.filter((r) => r.ok).length;
      const failed = results.filter((r) => !r.ok);
      reseed(ids);
      onSaved();
      if (failed.length) {
        const byId = new Map(matches.map((m) => [m.id, m]));
        setErr(
          failed
            .map((r) => {
              const m = byId.get(r.matchId);
              const name = m ? `${m.homeTeam} v ${m.awayTeam}` : r.matchId;
              return `${name}: ${r.error}`;
            })
            .join(" · "),
        );
      }
      setMsg(`Saved ${okN} line${okN === 1 ? "" : "s"}.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "error");
    } finally {
      setBusy(false);
    }
  }

  const cur = (l: Line | null) =>
    l ? `now ${ball(l.ballQ)} @ ${price(l.priceC)} (${l.status})` : "—";

  // Render day-separated rows for a table body.
  function dayRows(render: (m: GridMatch) => React.ReactNode, cols: number) {
    let lastDay = "";
    return sorted.map((m) => {
      const showDay = m.matchDay !== lastDay;
      lastDay = m.matchDay;
      const dl = dayLabel(m.matchDay, today, tomorrow);
      return (
        <tbody key={m.id}>
          {showDay && (
            <tr className="bg-gray-50">
              <td
                colSpan={cols}
                className="px-2 py-1 text-xs font-bold text-gray-500"
              >
                {dl.formatted}
                {dl.tag ? ` · ${dl.tag}` : ""}
              </td>
            </tr>
          )}
          {render(m)}
        </tbody>
      );
    });
  }

  const inputCls =
    "w-20 border rounded px-2 py-1 text-sm text-right tabular-nums";

  return (
    <div>
      {(msg || err) && (
        <div className="mb-3 space-y-1 text-sm">
          {msg && <p className="text-green-700">{msg}</p>}
          {err && <p className="text-red-600">{err}</p>}
        </div>
      )}
      <p className="mb-3 text-xs text-gray-500">
        Type the handicap/goals as a number (e.g. 0.75, 1, 2.5 — multiples of
        0.25) and the price as 0.01–1.00. Blank rows are ignored. Saving posts a
        new line version for every changed row at once.
      </p>

      {/* ── HANDICAP (AH) ── */}
      <div className="mb-6 overflow-x-auto">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-600">
            Handicap (AH)
          </h2>
          <button
            disabled={busy}
            onClick={saveAh}
            className="rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save all AH"}
          </button>
        </div>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase text-gray-500">
              <th className="py-1 pr-2">Match</th>
              <th className="py-1 pr-2">Fav</th>
              <th className="py-1 pr-2">Offer</th>
              <th className="py-1 pr-2 text-right">Ball</th>
              <th className="py-1 pr-2 text-right">Price</th>
              <th className="py-1 pr-2">Current</th>
            </tr>
          </thead>
          {dayRows(
            (m) => (
              <tr className="border-b">
                <td className="py-1 pr-2 whitespace-nowrap">
                  {m.homeTeam} v {m.awayTeam}
                </td>
                <td className="py-1 pr-2">
                  <select
                    className="border rounded px-1 py-1 text-sm"
                    value={ahOf(m).favSide}
                    onChange={(e) =>
                      setAh((p) => ({
                        ...p,
                        [m.id]: {
                          ...(p[m.id] ?? seedAh(m.line)),
                          favSide: e.target.value as "home" | "away",
                        },
                      }))
                    }
                  >
                    <option value="home">{m.homeTeam}</option>
                    <option value="away">{m.awayTeam}</option>
                  </select>
                </td>
                <td className="py-1 pr-2">
                  <select
                    className="border rounded px-1 py-1 text-sm"
                    value={ahOf(m).offeredSide}
                    onChange={(e) =>
                      setAh((p) => ({
                        ...p,
                        [m.id]: {
                          ...(p[m.id] ?? seedAh(m.line)),
                          offeredSide: e.target.value as "fav" | "dog",
                        },
                      }))
                    }
                  >
                    <option value="fav">
                      fav (
                      {ahOf(m).favSide === "home" ? m.homeTeam : m.awayTeam})
                    </option>
                    <option value="dog">
                      dog (
                      {ahOf(m).favSide === "home" ? m.awayTeam : m.homeTeam})
                    </option>
                  </select>
                </td>
                <td className="py-1 pr-2 text-right">
                  <input
                    inputMode="decimal"
                    className={inputCls}
                    placeholder="—"
                    value={ahOf(m).ball}
                    onChange={(e) =>
                      setAh((p) => ({
                        ...p,
                        [m.id]: {
                          ...(p[m.id] ?? seedAh(m.line)),
                          ball: e.target.value,
                        },
                      }))
                    }
                  />
                </td>
                <td className="py-1 pr-2 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      className={`w-6 rounded border text-sm font-bold ${
                        isNeg(ahOf(m).price)
                          ? "border-red-300 bg-red-50 text-red-600"
                          : "border-green-300 bg-green-50 text-green-700"
                      }`}
                      onClick={() =>
                        setAh((p) => {
                          const cur0 = p[m.id] ?? seedAh(m.line);
                          return {
                            ...p,
                            [m.id]: { ...cur0, price: flipSign(cur0.price) },
                          };
                        })
                      }
                    >
                      {isNeg(ahOf(m).price) ? "−" : "+"}
                    </button>
                    <input
                      inputMode="decimal"
                      className="w-14 rounded border px-2 py-1 text-right text-sm tabular-nums"
                      placeholder="—"
                      value={magOf(ahOf(m).price)}
                      onChange={(e) =>
                        setAh((p) => {
                          const cur0 = p[m.id] ?? seedAh(m.line);
                          return {
                            ...p,
                            [m.id]: {
                              ...cur0,
                              price: withSign(
                                isNeg(cur0.price),
                                e.target.value,
                              ),
                            },
                          };
                        })
                      }
                    />
                  </div>
                </td>
                <td className="py-1 pr-2 whitespace-nowrap text-xs text-gray-500">
                  {cur(m.line)}
                </td>
              </tr>
            ),
            6,
          )}
        </table>
      </div>

      {/* ── TOTALS (O/U) ── */}
      <div className="overflow-x-auto">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-600">
            Totals (O/U)
          </h2>
          <button
            disabled={busy}
            onClick={saveOu}
            className="rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save all O/U"}
          </button>
        </div>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase text-gray-500">
              <th className="py-1 pr-2">Match</th>
              <th className="py-1 pr-2">Offer</th>
              <th className="py-1 pr-2 text-right">Goals</th>
              <th className="py-1 pr-2 text-right">Price</th>
              <th className="py-1 pr-2">Current</th>
            </tr>
          </thead>
          {dayRows(
            (m) => (
              <tr className="border-b">
                <td className="py-1 pr-2 whitespace-nowrap">
                  {m.homeTeam} v {m.awayTeam}
                </td>
                <td className="py-1 pr-2">
                  <select
                    className="border rounded px-1 py-1 text-sm"
                    value={ouOf(m).offeredSide}
                    onChange={(e) =>
                      setOu((p) => ({
                        ...p,
                        [m.id]: {
                          ...(p[m.id] ?? seedOu(m.ouLine)),
                          offeredSide: e.target.value as "over" | "under",
                        },
                      }))
                    }
                  >
                    <option value="over">over</option>
                    <option value="under">under</option>
                  </select>
                </td>
                <td className="py-1 pr-2 text-right">
                  <input
                    inputMode="decimal"
                    className={inputCls}
                    placeholder="—"
                    value={ouOf(m).goals}
                    onChange={(e) =>
                      setOu((p) => ({
                        ...p,
                        [m.id]: {
                          ...(p[m.id] ?? seedOu(m.ouLine)),
                          goals: e.target.value,
                        },
                      }))
                    }
                  />
                </td>
                <td className="py-1 pr-2 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      className={`w-6 rounded border text-sm font-bold ${
                        isNeg(ouOf(m).price)
                          ? "border-red-300 bg-red-50 text-red-600"
                          : "border-green-300 bg-green-50 text-green-700"
                      }`}
                      onClick={() =>
                        setOu((p) => {
                          const cur0 = p[m.id] ?? seedOu(m.ouLine);
                          return {
                            ...p,
                            [m.id]: { ...cur0, price: flipSign(cur0.price) },
                          };
                        })
                      }
                    >
                      {isNeg(ouOf(m).price) ? "−" : "+"}
                    </button>
                    <input
                      inputMode="decimal"
                      className="w-14 rounded border px-2 py-1 text-right text-sm tabular-nums"
                      placeholder="—"
                      value={magOf(ouOf(m).price)}
                      onChange={(e) =>
                        setOu((p) => {
                          const cur0 = p[m.id] ?? seedOu(m.ouLine);
                          return {
                            ...p,
                            [m.id]: {
                              ...cur0,
                              price: withSign(
                                isNeg(cur0.price),
                                e.target.value,
                              ),
                            },
                          };
                        })
                      }
                    />
                  </div>
                </td>
                <td className="py-1 pr-2 whitespace-nowrap text-xs text-gray-500">
                  {cur(m.ouLine)}
                </td>
              </tr>
            ),
            5,
          )}
        </table>
      </div>
    </div>
  );
}
