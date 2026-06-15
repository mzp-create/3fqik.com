import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import * as schema from "./schema";

/** Single DB type the whole app is written against. The PGlite test instance is
 *  API-compatible and cast to this type in createTestDb(). */
export type Db = NodePgDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __db?: Db; __pool?: Pool };

export function getDb(): Db {
  if (!globalForDb.__db) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    globalForDb.__pool = pool;
    globalForDb.__db = drizzle(pool, { schema });
  }
  return globalForDb.__db;
}

export async function applyMigrations(db: Db) {
  await migrate(db, { migrationsFolder: "./drizzle" });
}

/** Tests: fresh in-process Postgres (PGlite) with schema applied. */
export async function createTestDb(): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle: drizzlePglite } = await import("drizzle-orm/pglite");
  const { migrate: migratePglite } =
    await import("drizzle-orm/pglite/migrator");
  const client = new PGlite();
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder: "./drizzle" });
  return db as unknown as Db;
}

export { schema };
