"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { mmk } from "@/lib/client/format";

type Settings = {
  id: number;
  dailyTotalLimitMmk: number;
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [limitInput, setLimitInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const reload = () =>
    api<Settings>("/api/admin/settings")
      .then((s) => {
        setSettings(s);
        setLimitInput(String(s.dailyTotalLimitMmk));
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

  return (
    <main>
      <h1 className="mb-4 text-lg font-bold">Settings</h1>

      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
      {saved && (
        <p className="text-green-700 text-sm mb-3">Saved successfully.</p>
      )}

      <div className="rounded border p-4">
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
    </main>
  );
}
