"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { mmk } from "@/lib/client/format";

type Settings = {
  id: number;
  dailyTotalLimitMmk: number;
  commissionPct: number;
  discountPct: number;
  cancelWindowSeconds: number;
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [limitInput, setLimitInput] = useState("");
  const [commissionInput, setCommissionInput] = useState("");
  const [discountInput, setDiscountInput] = useState("");
  const [cancelWindowInput, setCancelWindowInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const reload = () =>
    api<Settings>("/api/admin/settings")
      .then((s) => {
        setSettings(s);
        setLimitInput(String(s.dailyTotalLimitMmk));
        setCommissionInput(String(s.commissionPct));
        setDiscountInput(String(s.discountPct));
        setCancelWindowInput(String(s.cancelWindowSeconds));
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Failed to load"),
      );

  useEffect(() => {
    reload();
  }, []);

  async function saveLimit() {
    const val = parseInt(limitInput, 10);
    if (!Number.isInteger(val) || val < 0) {
      setError("Daily limit must be a non-negative integer (0 = unlimited)");
      return;
    }
    setError("");
    setSaved(false);
    setBusy(true);
    try {
      await api("/api/admin/settings", { dailyTotalLimitMmk: val });
      setSaved(true);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
    } finally {
      setBusy(false);
    }
  }

  async function saveFeeRates() {
    const commission = parseInt(commissionInput, 10);
    const discount = parseInt(discountInput, 10);
    if (!Number.isInteger(commission) || commission < 0 || commission > 100) {
      setError("Commission % must be an integer 0–100");
      return;
    }
    if (!Number.isInteger(discount) || discount < 0 || discount > 100) {
      setError("Discount % must be an integer 0–100");
      return;
    }
    setError("");
    setSaved(false);
    setBusy(true);
    try {
      await api("/api/admin/settings", {
        commissionPct: commission,
        discountPct: discount,
      });
      setSaved(true);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
    } finally {
      setBusy(false);
    }
  }

  async function saveCancelWindow() {
    const val = parseInt(cancelWindowInput, 10);
    if (!Number.isInteger(val) || val < 0 || val > 3600) {
      setError("Cancel window must be an integer 0–3600 seconds (0 = off)");
      return;
    }
    setError("");
    setSaved(false);
    setBusy(true);
    try {
      await api("/api/admin/settings", { cancelWindowSeconds: val });
      setSaved(true);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <h1 className="mb-4 text-lg font-bold">Settings</h1>

      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
      {saved && (
        <p className="text-green-700 text-sm mb-3">Saved successfully.</p>
      )}

      <div className="rounded border p-4 mb-4">
        <h2 className="font-semibold mb-3">Daily Bet Limit</h2>
        <p className="text-sm text-gray-500 mb-3">
          Maximum total stake across all players for any match day. Set to 0 for
          unlimited.
          {settings && settings.dailyTotalLimitMmk > 0 && (
            <span className="ml-1">
              Current: <strong>{mmk(settings.dailyTotalLimitMmk)}</strong> MMK
            </span>
          )}
          {settings && settings.dailyTotalLimitMmk === 0 && (
            <span className="ml-1">
              Current: <strong>unlimited</strong>
            </span>
          )}
        </p>
        <div className="flex gap-2 items-center">
          <input
            type="number"
            min="0"
            step="1000"
            className="border rounded px-2 py-1 text-sm w-40"
            placeholder="0 = unlimited"
            value={limitInput}
            onChange={(e) => {
              setLimitInput(e.target.value);
              setSaved(false);
            }}
          />
          <span className="text-sm text-gray-500">MMK</span>
          <button
            disabled={busy}
            onClick={saveLimit}
            className="bg-blue-600 text-white text-sm px-3 py-1 rounded disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>

      <div className="rounded border p-4">
        <h2 className="font-semibold mb-3">Commission &amp; Discount Rates</h2>
        <p className="text-sm text-gray-500 mb-3">
          Commission is deducted from player winnings; discount reduces player
          losses. Both applied at grading for unsettled bets only.
        </p>
        <div className="grid gap-3">
          <div className="flex gap-2 items-center">
            <label className="text-sm w-32 text-gray-600">Commission %</label>
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              className="border rounded px-2 py-1 text-sm w-20"
              placeholder="3"
              value={commissionInput}
              onChange={(e) => {
                setCommissionInput(e.target.value);
                setSaved(false);
              }}
            />
            <span className="text-sm text-gray-500">
              {settings != null && `(current: ${settings.commissionPct}%)`}
            </span>
          </div>
          <div className="flex gap-2 items-center">
            <label className="text-sm w-32 text-gray-600">Discount %</label>
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              className="border rounded px-2 py-1 text-sm w-20"
              placeholder="2"
              value={discountInput}
              onChange={(e) => {
                setDiscountInput(e.target.value);
                setSaved(false);
              }}
            />
            <span className="text-sm text-gray-500">
              {settings != null && `(current: ${settings.discountPct}%)`}
            </span>
          </div>
          <div>
            <button
              disabled={busy}
              onClick={saveFeeRates}
              className="bg-blue-600 text-white text-sm px-3 py-1 rounded disabled:opacity-50"
            >
              Save Fee Rates
            </button>
          </div>
        </div>
      </div>

      <div className="rounded border p-4 mt-4">
        <h2 className="font-semibold mb-3">Bet Cancellation Window</h2>
        <p className="text-sm text-gray-500 mb-3">
          How long after placing a bet a player may self-cancel it — only while
          the match hasn&apos;t kicked off and the line hasn&apos;t moved. Set
          to 0 to disable self-cancel (players must ask you to void).
        </p>
        <div className="flex gap-2 items-center">
          <label className="text-sm w-32 text-gray-600">Window (seconds)</label>
          <input
            type="number"
            min="0"
            max="3600"
            step="30"
            className="border rounded px-2 py-1 text-sm w-24"
            placeholder="180"
            value={cancelWindowInput}
            onChange={(e) => {
              setCancelWindowInput(e.target.value);
              setSaved(false);
            }}
          />
          <span className="text-sm text-gray-500">
            {settings != null &&
              `(current: ${settings.cancelWindowSeconds}s${
                settings.cancelWindowSeconds === 0 ? " — off" : ""
              })`}
          </span>
        </div>
        <div className="mt-3">
          <button
            disabled={busy}
            onClick={saveCancelWindow}
            className="bg-blue-600 text-white text-sm px-3 py-1 rounded disabled:opacity-50"
          >
            Save Cancel Window
          </button>
        </div>
      </div>
    </main>
  );
}
