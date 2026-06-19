import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { RegisterForm } from "@/components/RegisterForm";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;

  const h = await headers();
  const ip =
    (h.get("x-forwarded-for") ?? "").split(",")[0].trim() ||
    h.get("x-real-ip") ||
    "unknown";
  const ua = h.get("user-agent") ?? "unknown";

  // Determine validity and reason
  type Reason = "missing" | "unknown" | "expired" | "exhausted";
  let reason: Reason | null = null;

  // eslint-disable-next-line react-hooks/purity -- server component, not a hook
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  if (!code) {
    reason = "missing";
  } else {
    const db = getDb();
    const [row] = await db
      .select()
      .from(schema.inviteCodes)
      .where(eq(schema.inviteCodes.code, code));

    if (!row) {
      reason = "unknown";
    } else if (Date.parse(row.expiresAt) <= now) {
      reason = "expired";
    } else if (row.usedCount >= row.maxUses) {
      reason = "exhausted";
    }
  }

  if (reason !== null) {
    console.warn(
      `[register-blocked] ${nowIso} ip=${ip} ua="${ua}" code="${code ?? ""}" reason=${reason}`,
    );
    redirect("/invite-only");
  }

  return <RegisterForm code={code!} />;
}
