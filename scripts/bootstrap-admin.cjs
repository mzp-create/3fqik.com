// scripts/bootstrap-admin.cjs — one-time admin seeding for hosted deploys.
// Plain CommonJS (no tsx) so it runs fast at boot. Idempotent: only acts when
// ADMIN_BOOTSTRAP is set, and never overwrites an existing player's PIN.
//
// ADMIN_BOOTSTRAP format: "<phone>:<6-digit-pin>:<name>"  e.g. "09448019562:090210:Zeya"
// Safe to leave set — once the admin exists it is a no-op. Unset it for hygiene.
const Database = require("better-sqlite3");
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

const db = new Database(process.env.DATABASE_PATH);
const existing = db
  .prepare("select id, role from players where phone = ?")
  .get(phone);
if (existing) {
  if (existing.role !== "admin") {
    db.prepare("update players set role = 'admin' where id = ?").run(
      existing.id,
    );
    console.log(`bootstrap-admin: promoted existing player ${phone} to admin`);
  } else {
    console.log(`bootstrap-admin: admin ${phone} already exists, no-op`);
  }
  process.exit(0);
}
db.prepare(
  "insert into players (phone, pin_hash, display_name, role, created_at) values (?, ?, ?, 'admin', ?)",
).run(phone, bcrypt.hashSync(pin, 10), name, new Date().toISOString());
console.log(`bootstrap-admin: created admin ${phone}`);
