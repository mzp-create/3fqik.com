import {
  pgTable,
  text,
  integer,
  bigint,
  boolean,
  unique,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Money columns are bigint(mode: 'number'): integer MMK, values well within the
// 2^53 exact-integer range, so arithmetic stays in plain JS numbers. Counts,
// scores, version, ball_q, price_c and *_pct stay integer. Timestamps are ISO
// strings stored as text, exactly as before the Postgres migration.

export const players = pgTable("players", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  phone: text("phone").notNull().unique(),
  pinHash: text("pin_hash").notNull(),
  displayName: text("display_name").notNull(),
  role: text("role", { enum: ["player", "admin"] })
    .notNull()
    .default("player"),
  language: text("language", { enum: ["en", "mm"] })
    .notNull()
    .default("en"),
  failedPinAttempts: integer("failed_pin_attempts").notNull().default(0),
  lockedUntil: text("locked_until"),
  mustChangePin: boolean("must_change_pin").notNull().default(false),
  sessionEpoch: integer("session_epoch").notNull().default(0), // bump to kill sessions
  createdAt: text("created_at").notNull(),
  referredBy: integer("referred_by").references((): AnyPgColumn => players.id),
});

export const inviteCodes = pgTable(
  "invite_codes",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    code: text("code").notNull().unique(),
    maxUses: integer("max_uses").notNull(),
    usedCount: integer("used_count").notNull().default(0),
    expiresAt: text("expires_at").notNull(),
    createdBy: integer("created_by")
      .notNull()
      .references(() => players.id),
    kind: text("kind", { enum: ["admin", "personal"] })
      .notNull()
      .default("admin"),
  },
  (t) => [
    uniqueIndex("invite_personal_uq")
      .on(t.createdBy)
      .where(sql`kind = 'personal'`),
  ],
);

export const matches = pgTable("matches", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  stage: text("stage").notNull(), // "Group A" | "R32" | ...
  homeTeam: text("home_team").notNull(), // "BRA" or "Winner A" placeholder
  awayTeam: text("away_team").notNull(),
  kickoffUtc: text("kickoff_utc").notNull(),
  venue: text("venue").notNull(),
  matchDay: text("match_day").notNull(), // YYYY-MM-DD in MMT
  status: text("status", { enum: ["scheduled", "live", "finished"] })
    .notNull()
    .default("scheduled"),
  homeScore: integer("home_score"),
  awayScore: integer("away_score"),
  scoreConfirmedAt: text("score_confirmed_at"),
  betLimitMmk: bigint("bet_limit_mmk", { mode: "number" }), // null = no carve-out, uses daily pool
  externalApiId: text("external_api_id"),
});

export const lines = pgTable(
  "lines",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    matchId: integer("match_id")
      .notNull()
      .references(() => matches.id),
    market: text("market", { enum: ["ah", "ou"] })
      .notNull()
      .default("ah"),
    version: integer("version").notNull(),
    favSide: text("fav_side", { enum: ["home", "away"] }).notNull(),
    // The single side this line offers for betting (Malay one-sided lines).
    offeredSide: text("offered_side", {
      enum: ["fav", "dog", "over", "under"],
    })
      .notNull()
      .default("fav"),
    ballQ: integer("ball_q").notNull(), // ball ×4, ≥ 0
    priceC: integer("price_c").notNull(), // signed Malay price ×100, [−100,−1]∪[1,100]
    status: text("status", {
      enum: ["active", "suspended", "closed"],
    }).notNull(),
    postedBy: integer("posted_by")
      .notNull()
      .references(() => players.id),
    postedAt: text("posted_at").notNull(),
  },
  (t) => [unique().on(t.matchId, t.market, t.version)],
);

export const matchDays = pgTable("match_days", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  date: text("date").notNull().unique(), // YYYY-MM-DD MMT
  status: text("status", { enum: ["open", "closed", "settled"] })
    .notNull()
    .default("open"),
  closedAt: text("closed_at"),
});

export const settlements = pgTable(
  "settlements",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    ref: text("ref").notNull().unique(), // S-MMDD-NN (system ref)
    matchDayId: integer("match_day_id")
      .notNull()
      .references(() => matchDays.id),
    playerId: integer("player_id")
      .notNull()
      .references(() => players.id),
    netMmk: bigint("net_mmk", { mode: "number" }).notNull(),
    markedBy: integer("marked_by")
      .notNull()
      .references(() => players.id),
    markedAt: text("marked_at").notNull(),
    paymentMethod: text("payment_method"), // e.g. Cash, KBZ Pay — nullable
    paymentReference: text("payment_reference"), // external payment ref — nullable
    remark: text("remark"), // free-text note — nullable
  },
  (t) => [unique().on(t.matchDayId, t.playerId)],
);

export const bets = pgTable("bets", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  ticketNo: text("ticket_no").notNull().unique(),
  playerId: integer("player_id")
    .notNull()
    .references(() => players.id),
  matchId: integer("match_id")
    .notNull()
    .references(() => matches.id),
  lineId: integer("line_id")
    .notNull()
    .references(() => lines.id),
  side: text("side", { enum: ["fav", "dog", "over", "under"] }).notNull(),
  stakeMmk: bigint("stake_mmk", { mode: "number" }).notNull(),
  scoreHomeAtBet: integer("score_home_at_bet").notNull(),
  scoreAwayAtBet: integer("score_away_at_bet").notNull(),
  placedAt: text("placed_at").notNull(),
  status: text("status", {
    enum: ["pending", "won", "half_won", "push", "half_lost", "lost", "void"],
  })
    .notNull()
    .default("pending"),
  netMmk: bigint("net_mmk", { mode: "number" }),
  feeMmk: bigint("fee_mmk", { mode: "number" }),
  settledAt: text("settled_at"),
  settlementId: integer("settlement_id").references(() => settlements.id),
  voidedBy: integer("voided_by").references(() => players.id),
  voidReason: text("void_reason"),
});

export const settings = pgTable("settings", {
  id: integer("id").primaryKey(), // always 1
  dailyTotalLimitMmk: bigint("daily_total_limit_mmk", { mode: "number" })
    .notNull()
    .default(0), // 0 = unlimited
  defaultPersonalInviteUses: integer("default_personal_invite_uses")
    .notNull()
    .default(10),
  referralBonusMmk: bigint("referral_bonus_mmk", { mode: "number" })
    .notNull()
    .default(0),
  commissionPct: integer("commission_pct").notNull().default(3),
  discountPct: integer("discount_pct").notNull().default(2),
  // Self-service bet-cancel window (seconds after placement). 0 disables it.
  cancelWindowSeconds: integer("cancel_window_seconds").notNull().default(180),
});

export const auditLog = pgTable("audit_log", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  actorId: integer("actor_id").notNull(),
  action: text("action").notNull(), // pin_reset | void | score_correction | limit_change | unlock | grant_admin
  subject: text("subject").notNull(),
  detail: text("detail"),
  at: text("at").notNull(),
});
