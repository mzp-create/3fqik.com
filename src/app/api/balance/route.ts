import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requirePlayer } from "@/lib/auth/session";
import { playerDayItems } from "@/lib/accounting/queries";
import { ok, handle } from "@/lib/api";

export async function GET() {
  return handle(async () => {
    const me = await requirePlayer();
    const db = getDb();
    const days = db
      .select()
      .from(schema.matchDays)
      .orderBy(desc(schema.matchDays.date))
      .all();
    const refs = new Map(
      db
        .select()
        .from(schema.settlements)
        .where(eq(schema.settlements.playerId, me.id))
        .all()
        .map((s) => [s.matchDayId, s.ref]),
    );
    return ok(
      days
        .map((d) => ({
          date: d.date,
          status: d.status,
          ref: refs.get(d.id) ?? null,
          items: playerDayItems(db, me.id, d.date),
        }))
        .filter((d) => d.items.length > 0),
    );
  });
}
