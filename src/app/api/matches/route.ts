import { getDb, schema } from "@/lib/db";
import { requirePlayer } from "@/lib/auth/session";
import { latestLine } from "@/lib/lines/manage";
import { ok, handle } from "@/lib/api";

export async function GET() {
  return handle(async () => {
    await requirePlayer();
    const db = getDb();
    const all = await db.select().from(schema.matches);
    return ok(
      await Promise.all(
        all.map(async (m) => ({
          ...m,
          line: await latestLine(db, m.id, "ah"),
          ouLine: await latestLine(db, m.id, "ou"),
        })),
      ),
    );
  });
}
