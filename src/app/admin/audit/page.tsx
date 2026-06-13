"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";

type AuditRow = {
  id: number;
  at: string;
  action: string;
  subject: string;
  detail: string | null;
  actorId: number;
  actorName: string;
};

function formatMmt(isoString: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Yangon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(isoString));
}

const ACTION_COLORS: Record<string, string> = {
  void: "bg-red-50 text-red-700",
  pin_reset: "bg-yellow-50 text-yellow-700",
  score_correction: "bg-blue-50 text-blue-700",
  final_score: "bg-blue-50 text-blue-700",
  limit_change: "bg-purple-50 text-purple-700",
  unlock: "bg-green-50 text-green-700",
  grant_admin: "bg-orange-50 text-orange-700",
};

export default function AuditPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api<AuditRow[]>("/api/admin/audit")
      .then((data) => {
        setRows(data);
        setLoading(false);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Failed to load");
        setLoading(false);
      });
  }, []);

  return (
    <main>
      <h1 className="mb-1 text-lg font-bold">Audit Log</h1>
      <p className="text-xs text-gray-500 mb-3 leading-relaxed">
        Last 200 entries, newest first. Registration-block attempts are in the
        server log (
        <code className="font-mono">
          journalctl -u worldbet | grep register-blocked
        </code>
        ), not here.
      </p>

      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
      {loading && <p className="text-gray-500">Loading…</p>}

      {!loading && rows.length === 0 && (
        <p className="text-gray-500 text-sm">No audit entries yet.</p>
      )}

      {!loading && rows.length > 0 && (
        <div className="space-y-1">
          {rows.map((row) => {
            const actionStyle =
              ACTION_COLORS[row.action] ?? "bg-gray-50 text-gray-600";
            return (
              <div key={row.id} className="rounded border px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-gray-400 shrink-0">
                    {formatMmt(row.at)}
                  </span>
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded font-semibold shrink-0 ${actionStyle}`}
                  >
                    {row.action}
                  </span>
                  <span className="font-semibold shrink-0">
                    {row.actorName}
                  </span>
                  <span className="text-gray-500 font-mono text-xs">
                    {row.subject}
                  </span>
                </div>
                {row.detail && (
                  <div className="text-xs text-gray-500 mt-0.5">
                    {row.detail}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
