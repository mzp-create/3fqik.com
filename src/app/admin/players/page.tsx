"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";

type Player = {
  id: number;
  phone: string;
  displayName: string;
  role: "player" | "admin";
  language: "en" | "mm";
  failedPinAttempts: number;
  lockedUntil: string | null;
  mustChangePin: boolean;
  createdAt: string;
};

type InviteCode = {
  id: number;
  code: string;
  maxUses: number;
  usedCount: number;
  expiresAt: string;
  createdBy: number;
};

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [invites, setInvites] = useState<InviteCode[]>([]);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  // Captured once at mount so render stays idempotent (react-hooks/purity).
  const [nowMs] = useState<number>(() => Date.now());
  // New invite form
  const [inviteMaxUses, setInviteMaxUses] = useState("10");
  const [inviteExpiry, setInviteExpiry] = useState("");

  const reload = () =>
    Promise.all([
      api<Player[]>("/api/admin/players"),
      api<InviteCode[]>("/api/admin/invites"),
    ])
      .then(([ps, is]) => {
        setPlayers(ps);
        setInvites(is);
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Failed to load"),
      );

  useEffect(() => {
    reload();
  }, []); // run once on mount

  function setBusyFor(key: string, val: boolean) {
    setBusy((prev) => ({ ...prev, [key]: val }));
  }

  async function playerAction(
    playerId: number,
    action: "reset_pin" | "unlock" | "grant_admin",
  ) {
    const key = `${action}-${playerId}`;
    let tempPin: string | undefined;
    if (action === "reset_pin") {
      const input = window.prompt(
        "Enter temporary 6-digit PIN for this player:",
      );
      if (!input) return;
      if (!/^\d{6}$/.test(input)) {
        setError("Temporary PIN must be exactly 6 digits");
        return;
      }
      tempPin = input;
    }
    if (action === "grant_admin") {
      const ok = window.confirm(`Grant admin role to player #${playerId}?`);
      if (!ok) return;
    }
    setError("");
    setBusyFor(key, true);
    try {
      await api("/api/admin/players", { action, playerId, tempPin });
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
    } finally {
      setBusyFor(key, false);
    }
  }

  async function createInvite() {
    const maxUses = parseInt(inviteMaxUses, 10);
    if (!Number.isInteger(maxUses) || maxUses < 1) {
      setError("Max uses must be a positive integer");
      return;
    }
    if (!inviteExpiry || isNaN(Date.parse(inviteExpiry))) {
      setError("Expiry date is required");
      return;
    }
    const expiresAt = new Date(inviteExpiry + "T23:59:59Z").toISOString();
    if (Date.parse(expiresAt) <= Date.now()) {
      setError("Expiry must be in the future");
      return;
    }
    setError("");
    setBusyFor("create-invite", true);
    try {
      await api("/api/admin/invites", { maxUses, expiresAt });
      setInviteMaxUses("10");
      setInviteExpiry("");
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
    } finally {
      setBusyFor("create-invite", false);
    }
  }

  return (
    <main>
      <h1 className="mb-4 text-lg font-bold">Players</h1>

      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

      {players.map((p) => {
        const isLocked = !!p.lockedUntil && Date.parse(p.lockedUntil) > nowMs;
        return (
          <div key={p.id} className="mb-4 rounded border p-3">
            <div className="flex items-start justify-between mb-1">
              <div>
                <span className="font-semibold">{p.displayName}</span>
                {p.role === "admin" && (
                  <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-1 rounded">
                    admin
                  </span>
                )}
                {isLocked && (
                  <span className="ml-2 text-xs bg-red-100 text-red-700 px-1 rounded">
                    locked
                  </span>
                )}
                {p.mustChangePin && (
                  <span className="ml-2 text-xs bg-yellow-100 text-yellow-700 px-1 rounded">
                    must change PIN
                  </span>
                )}
              </div>
              <span className="text-xs text-gray-400">#{p.id}</span>
            </div>
            <div className="text-xs text-gray-500 mb-2">{p.phone}</div>
            <div className="flex flex-wrap gap-2">
              <button
                disabled={busy[`reset_pin-${p.id}`]}
                onClick={() => playerAction(p.id, "reset_pin")}
                className="border text-xs px-2 py-1 rounded disabled:opacity-50"
              >
                Reset PIN
              </button>
              {isLocked && (
                <button
                  disabled={busy[`unlock-${p.id}`]}
                  onClick={() => playerAction(p.id, "unlock")}
                  className="border border-green-400 text-green-700 text-xs px-2 py-1 rounded disabled:opacity-50"
                >
                  Unlock
                </button>
              )}
              {p.role !== "admin" && (
                <button
                  disabled={busy[`grant_admin-${p.id}`]}
                  onClick={() => playerAction(p.id, "grant_admin")}
                  className="border border-amber-400 text-amber-700 text-xs px-2 py-1 rounded disabled:opacity-50"
                >
                  Grant Admin
                </button>
              )}
            </div>
          </div>
        );
      })}

      {/* Invites section */}
      <h2 className="mt-6 mb-3 font-semibold">Invite Codes</h2>

      {invites.length === 0 && (
        <p className="text-sm text-gray-500 mb-3">No invite codes yet.</p>
      )}

      {invites.map((inv) => {
        const expired = Date.parse(inv.expiresAt) <= nowMs;
        const exhausted = inv.usedCount >= inv.maxUses;
        return (
          <div
            key={inv.id}
            className={`mb-2 rounded border p-2 text-sm flex items-center justify-between ${
              expired || exhausted ? "opacity-50" : ""
            }`}
          >
            <div>
              <span className="font-mono font-semibold">{inv.code}</span>
              <span className="ml-2 text-xs text-gray-500">
                {inv.usedCount}/{inv.maxUses} uses
              </span>
              {expired && (
                <span className="ml-1 text-xs text-red-600">expired</span>
              )}
              {exhausted && !expired && (
                <span className="ml-1 text-xs text-gray-500">exhausted</span>
              )}
            </div>
            <span className="text-xs text-gray-400">
              exp {inv.expiresAt.slice(0, 10)}
            </span>
          </div>
        );
      })}

      {/* Create invite form */}
      <div className="mt-4 rounded border p-3">
        <h3 className="text-sm font-semibold mb-2">Create Invite</h3>
        <div className="space-y-2">
          <div className="flex gap-2 items-center text-sm">
            <label className="w-20 text-gray-600">Max uses</label>
            <input
              type="number"
              min="1"
              step="1"
              className="border rounded px-2 py-0.5 w-24 text-sm"
              value={inviteMaxUses}
              onChange={(e) => setInviteMaxUses(e.target.value)}
            />
          </div>
          <div className="flex gap-2 items-center text-sm">
            <label className="w-20 text-gray-600">Expires</label>
            <input
              type="date"
              className="border rounded px-2 py-0.5 text-sm"
              value={inviteExpiry}
              onChange={(e) => setInviteExpiry(e.target.value)}
            />
          </div>
          <button
            disabled={busy["create-invite"]}
            onClick={createInvite}
            className="bg-blue-600 text-white text-sm px-3 py-1 rounded disabled:opacity-50"
          >
            Create
          </button>
        </div>
      </div>
    </main>
  );
}
