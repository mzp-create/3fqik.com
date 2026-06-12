import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from './schema'

const globalForDb = globalThis as unknown as { __db?: ReturnType<typeof create> }

function create(path = process.env.DATABASE_PATH ?? './worldbet.db') {
  const sqlite = new Database(path)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  return drizzle(sqlite, { schema })
}

export function getDb() {
  if (!globalForDb.__db) globalForDb.__db = create()
  return globalForDb.__db
}

/** Tests: fresh in-memory db with schema applied. */
export function createTestDb() {
  const db = create(':memory:')
  applyMigrations(db)
  return db
}

export function applyMigrations(db: ReturnType<typeof create>) {
  migrate(db, { migrationsFolder: './drizzle' })
}

export { schema }
export type Db = ReturnType<typeof create>
