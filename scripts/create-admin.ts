import { getDb, schema } from "../src/lib/db/index";
import { normalizePhone } from "../src/lib/auth/phone";
import { hashPin } from "../src/lib/auth/pin";
import { nowIso } from "../src/lib/time";

const [phone, pin, name] = process.argv.slice(2);
if (!phone || !pin || !name || !/^\d{6}$/.test(pin)) {
  console.error(
    "usage: npx tsx scripts/create-admin.ts <phone> <6-digit-pin> <name>",
  );
  process.exit(1);
}

async function main() {
  const db = getDb();
  try {
    await db.insert(schema.players).values({
      phone: normalizePhone(phone),
      pinHash: hashPin(pin),
      displayName: name,
      role: "admin",
      createdAt: nowIso(),
    });
    console.log("admin created");
  } catch (e: unknown) {
    // Postgres unique violation code is '23505'
    if ((e as { code?: string })?.code === "23505") {
      console.error("error: a player with that phone number already exists");
      process.exit(1);
    }
    if (e instanceof Error && e.message === "invalid phone") {
      console.error("error: invalid phone number");
      process.exit(1);
    }
    throw e;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
