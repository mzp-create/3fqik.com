import { getDb } from "@/lib/db";
import { requirePlayer } from "@/lib/auth/session";
import { ok, fail, handle } from "@/lib/api";
import { referralInfo } from "@/lib/referrals";

export async function GET() {
  return handle(async () => {
    const me = await requirePlayer();
    const origin = process.env.APP_ORIGIN;
    if (!origin)
      return fail("config_error", "APP_ORIGIN env var is not set", 500);
    const info = referralInfo(getDb(), me.id);
    return ok({
      ...info,
      link: `${origin}/register?code=${info.code}`,
    });
  });
}
