import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requirePlayer } from "@/lib/auth/session";
import { ok, fail, handle } from "@/lib/api";

export async function POST(req: Request) {
  return handle(async () => {
    const me = await requirePlayer({ allowMustChangePin: true });
    const body = await req.json();
    const { language } = body;
    if (language !== "en" && language !== "mm")
      return fail("bad_request", 'language must be "en" or "mm"');
    getDb()
      .update(schema.players)
      .set({ language })
      .where(eq(schema.players.id, me.id))
      .run();
    return ok({});
  });
}
