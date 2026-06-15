// One-time data cutover: copy every row from the live SQLite worldbet.db into
// the Postgres database named by DATABASE_URL. Run AFTER `drizzle-kit migrate`
// has created the Postgres schema.
//
//   SQLITE_PATH=./worldbet.db DATABASE_URL=postgres://… node scripts/migrate-sqlite-to-pg.mjs
//
// Safe to dry-run against a scratch DB. Aborts if the target already has players
// unless FORCE=1 (which TRUNCATEs all tables first). Identity sequences are reset
// so future inserts continue past the imported ids.
import Database from "better-sqlite3";
import pg from "pg";

const SQLITE_PATH = process.env.SQLITE_PATH ?? "./worldbet.db";
const { DATABASE_URL, FORCE } = process.env;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

// Insert order respects foreign keys. players.referred_by (self-FK) is loaded
// null-first then back-filled. audit_log/settings have no inbound FKs.
const TABLES = [
  "players",
  "settings",
  "matches",
  "match_days",
  "invite_codes",
  "lines",
  "settlements",
  "bets",
  "audit_log",
];
const IDENTITY_TABLES = TABLES.filter((t) => t !== "settings"); // settings.id is fixed (=1)
const BOOL_COLS = new Set(["must_change_pin"]);

const sqlite = new Database(SQLITE_PATH, { readonly: true });
const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();

function rowsOf(table) {
  return sqlite.prepare(`SELECT * FROM "${table}"`).all();
}
function coerce(col, val) {
  if (BOOL_COLS.has(col)) return val === null ? null : !!val; // 0/1 → bool
  return val;
}

async function insertRows(table, rows, { referredByNull = false } = {}) {
  if (rows.length === 0) return 0;
  let n = 0;
  for (const row of rows) {
    const cols = Object.keys(row);
    const vals = cols.map((c) =>
      referredByNull && c === "referred_by" ? null : coerce(c, row[c]),
    );
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
    const colList = cols.map((c) => `"${c}"`).join(", ");
    await client.query(
      `INSERT INTO "${table}" (${colList}) VALUES (${placeholders})`,
      vals,
    );
    n++;
  }
  return n;
}

try {
  const [{ count }] = (
    await client.query("SELECT count(*)::int AS count FROM players")
  ).rows;
  if (count > 0) {
    if (FORCE !== "1") {
      console.error(
        `Target already has ${count} players. Re-run with FORCE=1 to TRUNCATE and reload.`,
      );
      process.exit(1);
    }
    await client.query(
      `TRUNCATE ${TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`,
    );
    console.log("FORCE=1 → truncated all tables");
  }

  await client.query("BEGIN");

  // players first, with referred_by nulled to avoid self-FK ordering issues
  const players = rowsOf("players");
  await insertRows("players", players, { referredByNull: true });
  console.log(`players: ${players.length}`);

  for (const table of TABLES.filter((t) => t !== "players")) {
    const rows = rowsOf(table);
    const n = await insertRows(table, rows);
    console.log(`${table}: ${n}`);
  }

  // back-fill players.referred_by now that every player row exists
  let backfilled = 0;
  for (const p of players) {
    if (p.referred_by != null) {
      await client.query(`UPDATE players SET referred_by = $1 WHERE id = $2`, [
        p.referred_by,
        p.id,
      ]);
      backfilled++;
    }
  }
  console.log(`players.referred_by back-filled: ${backfilled}`);

  // reset identity sequences so new inserts continue past imported ids
  for (const t of IDENTITY_TABLES) {
    await client.query(
      `SELECT setval(
         pg_get_serial_sequence('${t}', 'id'),
         COALESCE((SELECT MAX(id) FROM "${t}"), 1),
         (SELECT COUNT(*) FROM "${t}") > 0
       )`,
    );
  }
  console.log("identity sequences reset");

  await client.query("COMMIT");
  console.log("\n✓ cutover complete");
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("cutover failed, rolled back:", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
  sqlite.close();
}
