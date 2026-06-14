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
    const settlementsByDay = new Map(
      db
        .select()
        .from(schema.settlements)
        .where(eq(schema.settlements.playerId, me.id))
        .all()
        .map((s) => [
          s.matchDayId,
          {
            ref: s.ref,
            paymentMethod: s.paymentMethod,
            paymentReference: s.paymentReference,
            remark: s.remark,
          },
        ]),
    );
    return ok(
      days
        .map((d) => {
          const settlement = settlementsByDay.get(d.id) ?? null;
          return {
            date: d.date,
            status: d.status,
            ref: settlement?.ref ?? null,
            paymentMethod: settlement?.paymentMethod ?? null,
            paymentReference: settlement?.paymentReference ?? null,
            remark: settlement?.remark ?? null,
            items: playerDayItems(db, me.id, d.date),
          };
        })
        .filter((d) => d.items.length > 0),
    );
  });
}
