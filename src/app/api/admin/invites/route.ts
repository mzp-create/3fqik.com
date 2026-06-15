import { getDb, schema } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { createInvite } from "@/lib/auth/adminActions";
import { ok, fail, handle } from "@/lib/api";

export async function GET() {
  return handle(async () => {
    await requireAdmin();
    return ok(await getDb().select().from(schema.inviteCodes));
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const admin = await requireAdmin();
    const { maxUses, expiresAt } = await req.json();
    if (
      typeof maxUses !== "number" ||
      !Number.isInteger(maxUses) ||
      maxUses < 1
    )
      return fail("bad_request", "maxUses must be a positive integer");
    if (
      typeof expiresAt !== "string" ||
      isNaN(Date.parse(expiresAt)) ||
      Date.parse(expiresAt) <= Date.now()
    )
      return fail("bad_request", "expiresAt must be a future ISO date");
    return ok(await createInvite(getDb(), admin.id, { maxUses, expiresAt }));
  });
}
