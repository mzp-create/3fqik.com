import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { dayBoard } from "@/lib/accounting/queries";
import { markPlayerPaid, voidTicket } from "@/lib/accounting/settle";
import { ok, fail, handle } from "@/lib/api";
import { nowIso } from "@/lib/time";

export async function GET(req: Request) {
  return handle(async () => {
    await requireAdmin();
    const date = new URL(req.url).searchParams.get("date");
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date))
      return fail("bad_request", "date query param required (YYYY-MM-DD)");
    return ok(dayBoard(getDb(), date));
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
      return ok(markPlayerPaid(getDb(), admin.id, date, playerId, nowIso()));
    }

    if (body.action === "void") {
      const { ticketNo, reason } = body;
      if (typeof ticketNo !== "string" || !ticketNo)
        return fail("bad_request", "ticketNo (string) required");
      voidTicket(getDb(), admin.id, ticketNo, reason ?? "", nowIso());
      return ok({});
    }

    return fail("bad_action", "unknown action");
  });
}
