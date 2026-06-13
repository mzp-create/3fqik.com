import { desc, eq } from "drizzle-orm";
import { getDb, schema, type Db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { ok, handle } from "@/lib/api";

type AuditRow = {
  id: number;
  at: string;
  action: string;
  subject: string;
  detail: string | null;
  actorId: number;
  actorName: string;
};

const CAP = 200;

export function getAuditLog(db: Db): AuditRow[] {
  const rows = db
    .select()
    .from(schema.auditLog)
    .orderBy(desc(schema.auditLog.at))
    .limit(CAP)
    .all();

  // Resolve actorId → display_name; cache to avoid re-querying the same ID
  const nameCache = new Map<number, string>();

  return rows.map((row) => {
    let actorName: string;
    if (row.actorId === 0) {
      actorName = "system";
    } else {
      if (!nameCache.has(row.actorId)) {
        const p = db
          .select({ displayName: schema.players.displayName })
          .from(schema.players)
          .where(eq(schema.players.id, row.actorId))
          .get();
        nameCache.set(row.actorId, p?.displayName ?? "system");
      }
      actorName = nameCache.get(row.actorId)!;
    }
    return { ...row, actorName };
  });
}

export async function GET() {
  return handle(async () => {
    await requireAdmin();
    const rows = getAuditLog(getDb());
    return ok(rows);
  });
}
