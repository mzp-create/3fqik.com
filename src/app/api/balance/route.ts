import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requirePlayer } from "@/lib/auth/session";
import { playerDayItems } from "@/lib/accounting/queries";
import { ok, handle } from "@/lib/api";

export async function GET() {
  return handle(async () => {
    const me = await requirePlayer();
    const db = getDb();
    const days = await db
      .select()
      .from(schema.matchDays)
      .orderBy(desc(schema.matchDays.date));
    const settlementsByDay = new Map(
      (
        await db
          .select()
          .from(schema.settlements)
          .where(eq(schema.settlements.playerId, me.id))
      ).map((s) => [
        s.matchDayId,
        {
          ref: s.ref,
          paymentMethod: s.paymentMethod,
          paymentReference: s.paymentReference,
          remark: s.remark,
        },
      ]),
    );
    const enriched = await Promise.all(
      days.map(async (d) => {
        const settlement = settlementsByDay.get(d.id) ?? null;
        return {
          date: d.date,
          status: d.status,
          ref: settlement?.ref ?? null,
          paymentMethod: settlement?.paymentMethod ?? null,
          paymentReference: settlement?.paymentReference ?? null,
          remark: settlement?.remark ?? null,
          items: await playerDayItems(db, me.id, d.date),
        };
      }),
    );
    return ok(enriched.filter((d) => d.items.length > 0));
  });
}
