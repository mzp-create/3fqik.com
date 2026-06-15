import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { dayBoard, playerDayItems } from "@/lib/accounting/queries";
import { markPlayerPaid, voidTicket } from "@/lib/accounting/settle";
import { ok, fail, handle } from "@/lib/api";
import { nowIso } from "@/lib/time";

export async function GET(req: Request) {
  return handle(async () => {
    await requireAdmin();
    const date = new URL(req.url).searchParams.get("date");
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date))
      return fail("bad_request", "date query param required (YYYY-MM-DD)");
    const db = getDb();
    const board = await dayBoard(db, date);
    const rowsWithTickets = await Promise.all(
      board.rows.map(async (r) => ({
        ...r,
        tickets: await playerDayItems(db, r.playerId, date),
      })),
    );
    const [feeRow] = await db
      .select({
        commissionPct: schema.settings.commissionPct,
        discountPct: schema.settings.discountPct,
      })
      .from(schema.settings)
      .where(eq(schema.settings.id, 1));
    const feeSettings = feeRow ?? { commissionPct: 3, discountPct: 2 };
    return ok({ ...board, rows: rowsWithTickets, feeSettings });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const admin = await requireAdmin();
    const body = await req.json();

    if (body.action === "mark_paid") {
      const { date, playerId } = body;
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date))
        return fail("bad_request", "date required (YYYY-MM-DD)");
      if (!Number.isInteger(playerId))
        return fail("bad_request", "playerId must be an integer");

      const capStr = (v: unknown, max = 200) =>
        typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;

      return ok(
        await markPlayerPaid(getDb(), admin.id, date, playerId, nowIso(), {
          paymentMethod: capStr(body.paymentMethod),
          paymentReference: capStr(body.paymentReference),
          remark: capStr(body.remark),
        }),
      );
    }

    if (body.action === "void") {
      const { ticketNo, reason } = body;
      if (typeof ticketNo !== "string" || !ticketNo)
        return fail("bad_request", "ticketNo (string) required");
      if (!reason?.trim()) return fail("bad_request", "void reason required");
      await voidTicket(getDb(), admin.id, ticketNo, reason, nowIso());
      return ok({});
    }

    return fail("bad_action", "unknown action");
  });
}
