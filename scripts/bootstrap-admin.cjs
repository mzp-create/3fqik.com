/* eslint-disable @typescript-eslint/no-require-imports -- Node CJS boot script; require() is correct here */
// scripts/bootstrap-admin.cjs — one-time admin seeding for hosted deploys.
// Plain CommonJS (no tsx) so it runs fast at boot. Idempotent: only acts when
// ADMIN_BOOTSTRAP is set, and never overwrites an existing player's PIN.
//
// ADMIN_BOOTSTRAP format: "<phone>:<6-digit-pin>:<name>"  e.g. "09448019562:090210:Zeya"
// Safe to leave set — once the admin exists it is a no-op. Unset it for hygiene.
const { Client } = require("pg");
const bcrypt = require("bcryptjs");

const spec = process.env.ADMIN_BOOTSTRAP;
if (!spec) {
  console.log("bootstrap-admin: ADMIN_BOOTSTRAP not set, skipping");
  process.exit(0);
}
const [phone, pin, ...nameParts] = spec.split(":");
const name = nameParts.join(":").trim() || "Admin";
if (!/^09\d{7,10}$/.test(phone || "")) {
  console.error("bootstrap-admin: phone must be canonical 09… form");
  process.exit(1);
}
if (!/^\d{6}$/.test(pin || "")) {
  console.error("bootstrap-admin: pin must be exactly 6 digits");
  process.exit(1);
}

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    const result = await c.query(
      "select id, role from players where phone = $1",
      [phone],
    );
    const existing = result.rows[0];
    if (existing) {
      if (existing.role !== "admin") {
        await c.query("update players set role = 'admin' where id = $1", [
          existing.id,
        ]);
        console.log(
          `bootstrap-admin: promoted existing player ${phone} to admin`,
        );
      } else {
        console.log(`bootstrap-admin: admin ${phone} already exists, no-op`);
      }
    } else {
      await c.query(
        "insert into players (phone, pin_hash, display_name, role, created_at) values ($1, $2, $3, 'admin', $4)",
        [phone, bcrypt.hashSync(pin, 10), name, new Date().toISOString()],
      );
      console.log(`bootstrap-admin: created admin ${phone}`);
    }
  } finally {
    await c.end();
  }
})().catch((e) => {
  console.error("bootstrap-admin error:", e);
  process.exit(1);
});
