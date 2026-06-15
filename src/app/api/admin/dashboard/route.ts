import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { dashboard } from "@/lib/accounting/dashboard";
import { matchDayOf, nowIso } from "@/lib/time";
import { ok, handle } from "@/lib/api";

export async function GET() {
  return handle(async () => {
    await requireAdmin();
    return ok(await dashboard(getDb(), matchDayOf(nowIso())));
  });
}
