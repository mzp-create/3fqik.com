import { eq } from "drizzle-orm";
import { getDb, schema } from "../src/lib/db/index";
import { normalizePhone } from "../src/lib/auth/phone";
import { registerSuccess } from "../src/lib/auth/pin";

// Clears a PIN lockout for one player (resets failed attempts + lock).
// Mirrors what a successful login does, for when the locked-out account is the
// admin and so can't unlock itself through the UI.
//   DATABASE_URL=… npx tsx scripts/unlock.ts <phone>
const [rawPhone] = process.argv.slice(2);
if (!rawPhone) {
  console.error("usage: npx tsx scripts/unlock.ts <phone>");
  process.exit(1);
}

async function main() {
  let phone: string;
  try {
    phone = normalizePhone(rawPhone);
  } catch {
    console.error("error: invalid phone number");
    process.exit(1);
  }

  const db = getDb();
  const rows = await db
    .update(schema.players)
    .set(registerSuccess()) // { failedPinAttempts: 0, lockedUntil: null }
    .where(eq(schema.players.phone, phone))
    .returning({
      phone: schema.players.phone,
      displayName: schema.players.displayName,
    });

  if (rows.length === 0) {
    console.error(`error: no player found with phone ${phone}`);
    process.exit(1);
  }
  console.log(`unlocked ${rows[0].displayName} (${rows[0].phone})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
