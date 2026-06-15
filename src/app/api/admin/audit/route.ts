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

export async function getAuditLog(db: Db): Promise<AuditRow[]> {
  const rows = await db
    .select()
    .from(schema.auditLog)
    .orderBy(desc(schema.auditLog.at))
    .limit(CAP);

  // Resolve actorId → display_name; cache to avoid re-querying the same ID
  const nameCache = new Map<number, string>();

  const result: AuditRow[] = [];
  for (const row of rows) {
    let actorName: string;
    if (row.actorId === 0) {
      actorName = "system";
    } else {
      if (!nameCache.has(row.actorId)) {
        const [p] = await db
          .select({ displayName: schema.players.displayName })
          .from(schema.players)
          .where(eq(schema.players.id, row.actorId));
        nameCache.set(row.actorId, p?.displayName ?? "system");
      }
      actorName = nameCache.get(row.actorId)!;
    }
    result.push({ ...row, actorName });
  }
  return result;
}

export async function GET() {
  return handle(async () => {
    await requireAdmin();
    const rows = await getAuditLog(getDb());
    return ok(rows);
  });
}
