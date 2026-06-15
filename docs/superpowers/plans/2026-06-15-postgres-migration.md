# PostgreSQL Migration Implementation Plan

> **For agentic workers:** execute task-by-task. Steps use `- [ ]` checkboxes.

**Goal:** Replace better-sqlite3 with self-hosted PostgreSQL, code fully PG-native,
no behavior change, all tests green.

**Architecture:** drizzle-orm/node-postgres + pg.Pool (localhost). Money columns
bigint(number). Timestamps stay text. PGlite for tests. Fresh PG migration
baseline. One-time data cutover from worldbet.db.

**Tech Stack:** Next.js 16, Drizzle ORM, pg, @electric-sql/pglite, Postgres 16.

---

## Task 0: Postgres server + DB/role (ops)

- [ ] `sudo apt-get install -y postgresql postgresql-contrib`
- [ ] Create role `worldbet` (login, password) + database `worldbet` owned by it.
- [ ] Record `DATABASE_URL=postgres://worldbet:<pw>@localhost:5432/worldbet` in `.env.local`.

## Task 1: Dependencies + config

- [ ] `npm i pg && npm i -D @types/pg` (keep better-sqlite3 for cutover script).
- [ ] `npm i @electric-sql/pglite` (dev-time test DB; runtime-safe to keep in deps).
- [ ] `drizzle.config.ts` → `dialect: 'postgresql'`, `dbCredentials: { url: process.env.DATABASE_URL }`.
- [ ] `.env.example` / `.env.production.example`: `DATABASE_PATH` → `DATABASE_URL`.

## Task 2: Schema port (`src/lib/db/schema.ts`)

- [ ] `sqliteTable`→`pgTable`; import from `drizzle-orm/pg-core`.
- [ ] PKs: `integer('id').primaryKey().generatedByDefaultAsIdentity()`.
- [ ] Money cols → `bigint(name, { mode: 'number' })`: stake_mmk, net_mmk, fee_mmk, daily_total_limit_mmk, referral_bonus_mmk.
- [ ] Other ints stay `integer`. `mustChangePin` → `boolean`. All `text` cols unchanged (timestamps stay text).
- [ ] Partial unique index `invite_personal_uq` and composite `unique()` constraints reproduced in pg-core.

## Task 3: DB connection (`src/lib/db/index.ts`)

- [ ] `pg.Pool` from `DATABASE_URL`; `drizzle(pool, { schema })` via `drizzle-orm/node-postgres`.
- [ ] `applyMigrations` uses `drizzle-orm/node-postgres/migrator` (async).
- [ ] `createTestDb()` → PGlite: `drizzle` over `@electric-sql/pglite`, apply migrations via `drizzle-orm/pglite/migrator`. Returns a Promise now.
- [ ] Export types; `getDb()` returns the pooled drizzle instance.

## Task 4: Regenerate migrations

- [ ] `mkdir drizzle/sqlite-archive`, move old `*.sql`/`meta` there.
- [ ] `drizzle-kit generate` → PG baseline `0000`.
- [ ] `drizzle-kit migrate` against local PG; verify tables.

## Task 5: Async conversion sweep (the bulk)

For every non-test file in the grep list:

- [ ] Replace `.get()` → `const [row] = await q` (or `await q.limit(1)` then `[0]`).
- [ ] Replace `.all()` → `await q`. Replace `.run()` → `await q`.
- [ ] `db.transaction(tx => …)` → `await db.transaction(async (tx) => …)`; inner reads awaited.
- [ ] Add `FOR UPDATE` locks in `placeBet` (line + match_day rows).
- [ ] ticket_no retry: catch `err.code === '23505'`.
- [ ] Propagate `async`/`await` up every call chain; route handlers await.
- [ ] `npx tsc --noEmit` clean.

## Task 6: Tests → PGlite green

- [ ] Update test helpers awaiting `createTestDb()`.
- [ ] Fix any sqlite-ism in tests (sql literals, error-message asserts).
- [ ] `npm test` → 185/185.

## Task 7: Scripts + ops

- [ ] `seed.ts`, `create-admin.ts`, `bootstrap-admin.cjs`, `regrade.ts` → pg client (async).
- [ ] `backup.sh` → `pg_dump` with 14-day retention.
- [ ] `worldbet.service` → `After=postgresql.service`, `Requires=postgresql.service`. Update `DEPLOY.md`.

## Task 8: Data cutover

- [ ] `scripts/migrate-sqlite-to-pg.ts`: read worldbet.db, insert all tables in FK order, reset identity sequences (`setval`).
- [ ] Dry-run on a scratch PG db; compare row counts + a few player balances vs dashboard.

## Task 9: Deploy

- [ ] Stop app, run cutover against prod PG, set `DATABASE_URL`, `npm run build`, restart.
- [ ] Verify login, place/grade/settle, reports. Keep worldbet.db for rollback.
