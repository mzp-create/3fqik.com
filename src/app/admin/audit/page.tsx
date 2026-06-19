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
  void: "bg-ca/15 text-ca",
  pin_reset: "bg-gold/15 text-gold",
  score_correction: "bg-us/15 text-us-neon",
  final_score: "bg-us/15 text-us-neon",
  limit_change: "bg-us/15 text-us-neon",
  unlock: "bg-mx/15 text-mx-neon",
  grant_admin: "bg-gold/15 text-gold",
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
      <p className="text-xs text-muted mb-3 leading-relaxed">
        Last 200 entries, newest first. Registration-block attempts are in the
        server log (
        <code className="font-mono rounded bg-raised px-1 py-0.5 text-muted">
          journalctl -u worldbet | grep register-blocked
        </code>
        ), not here.
      </p>

      {error && <p className="text-ca text-sm mb-3">{error}</p>}
      {loading && <p className="text-muted">Loading…</p>}

      {!loading && rows.length === 0 && (
        <p className="text-muted text-sm">No audit entries yet.</p>
      )}

      {!loading && rows.length > 0 && (
        <div className="space-y-1">
          {rows.map((row) => {
            const actionStyle =
              ACTION_COLORS[row.action] ?? "bg-raised text-muted";
            return (
              <div
                key={row.id}
                className="rounded border border-border bg-surface px-3 py-2 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-faint shrink-0">
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
                  <span className="text-muted font-mono text-xs">
                    {row.subject}
                  </span>
                </div>
                {row.detail && (
                  <div className="text-xs text-muted mt-0.5">{row.detail}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
