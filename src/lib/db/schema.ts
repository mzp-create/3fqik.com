import { sqliteTable, text, integer, unique } from 'drizzle-orm/sqlite-core'

export const players = sqliteTable('players', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  phone: text('phone').notNull().unique(),
  pinHash: text('pin_hash').notNull(),
  displayName: text('display_name').notNull(),
  role: text('role', { enum: ['player', 'admin'] }).notNull().default('player'),
  language: text('language', { enum: ['en', 'mm'] }).notNull().default('en'),
  failedPinAttempts: integer('failed_pin_attempts').notNull().default(0),
  lockedUntil: text('locked_until'),
  mustChangePin: integer('must_change_pin', { mode: 'boolean' }).notNull().default(false),
  sessionEpoch: integer('session_epoch').notNull().default(0), // bump to kill sessions
  createdAt: text('created_at').notNull(),
})

export const inviteCodes = sqliteTable('invite_codes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  code: text('code').notNull().unique(),
  maxUses: integer('max_uses').notNull(),
  usedCount: integer('used_count').notNull().default(0),
  expiresAt: text('expires_at').notNull(),
  createdBy: integer('created_by').notNull().references(() => players.id),
})

export const matches = sqliteTable('matches', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  stage: text('stage').notNull(),            // "Group A" | "R32" | ...
  homeTeam: text('home_team').notNull(),     // "BRA" or "Winner A" placeholder
  awayTeam: text('away_team').notNull(),
  kickoffUtc: text('kickoff_utc').notNull(),
  venue: text('venue').notNull(),
  matchDay: text('match_day').notNull(),     // YYYY-MM-DD in MMT
  status: text('status', { enum: ['scheduled', 'live', 'finished'] }).notNull().default('scheduled'),
  homeScore: integer('home_score'),
  awayScore: integer('away_score'),
  scoreConfirmedAt: text('score_confirmed_at'),
  betLimitMmk: integer('bet_limit_mmk'),     // null = no carve-out, uses daily pool
  externalApiId: text('external_api_id'),
})

export const lines = sqliteTable('lines', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  matchId: integer('match_id').notNull().references(() => matches.id),
  version: integer('version').notNull(),
  favSide: text('fav_side', { enum: ['home', 'away'] }).notNull(),
  ballQ: integer('ball_q').notNull(),        // ball ×4, ≥ 0
  priceC: integer('price_c').notNull(),      // Malay ×100, −100..100, ≠0
  status: text('status', { enum: ['active', 'suspended', 'closed'] }).notNull(),
  postedBy: integer('posted_by').notNull().references(() => players.id),
  postedAt: text('posted_at').notNull(),
}, (t) => [unique().on(t.matchId, t.version)])

export const matchDays = sqliteTable('match_days', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  date: text('date').notNull().unique(),     // YYYY-MM-DD MMT
  status: text('status', { enum: ['open', 'closed', 'settled'] }).notNull().default('open'),
  closedAt: text('closed_at'),
})

export const settlements = sqliteTable('settlements', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ref: text('ref').notNull().unique(),       // S-MMDD-NN
  matchDayId: integer('match_day_id').notNull().references(() => matchDays.id),
  playerId: integer('player_id').notNull().references(() => players.id),
  netMmk: integer('net_mmk').notNull(),
  markedBy: integer('marked_by').notNull().references(() => players.id),
  markedAt: text('marked_at').notNull(),
}, (t) => [unique().on(t.matchDayId, t.playerId)])

export const bets = sqliteTable('bets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ticketNo: text('ticket_no').notNull().unique(),
  playerId: integer('player_id').notNull().references(() => players.id),
  matchId: integer('match_id').notNull().references(() => matches.id),
  lineId: integer('line_id').notNull().references(() => lines.id),
  side: text('side', { enum: ['fav', 'dog'] }).notNull(),
  stakeMmk: integer('stake_mmk').notNull(),
  scoreHomeAtBet: integer('score_home_at_bet').notNull(),
  scoreAwayAtBet: integer('score_away_at_bet').notNull(),
  placedAt: text('placed_at').notNull(),
  status: text('status', {
    enum: ['pending', 'won', 'half_won', 'push', 'half_lost', 'lost', 'void'],
  }).notNull().default('pending'),
  netMmk: integer('net_mmk'),
  settledAt: text('settled_at'),
  settlementId: integer('settlement_id').references(() => settlements.id),
  voidedBy: integer('voided_by').references(() => players.id),
  voidReason: text('void_reason'),
})

export const settings = sqliteTable('settings', {
  id: integer('id').primaryKey(),            // always 1
  dailyTotalLimitMmk: integer('daily_total_limit_mmk').notNull().default(0), // 0 = unlimited
})

export const auditLog = sqliteTable('audit_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  actorId: integer('actor_id').notNull(),
  action: text('action').notNull(), // pin_reset | void | score_correction | limit_change | unlock | grant_admin
  subject: text('subject').notNull(),
  detail: text('detail'),
  at: text('at').notNull(),
})
