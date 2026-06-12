CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor_id` integer NOT NULL,
	`action` text NOT NULL,
	`subject` text NOT NULL,
	`detail` text,
	`at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `bets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticket_no` text NOT NULL,
	`player_id` integer NOT NULL,
	`match_id` integer NOT NULL,
	`line_id` integer NOT NULL,
	`side` text NOT NULL,
	`stake_mmk` integer NOT NULL,
	`score_home_at_bet` integer NOT NULL,
	`score_away_at_bet` integer NOT NULL,
	`placed_at` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`net_mmk` integer,
	`settled_at` text,
	`settlement_id` integer,
	`voided_by` integer,
	`void_reason` text,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`line_id`) REFERENCES `lines`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`settlement_id`) REFERENCES `settlements`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`voided_by`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bets_ticket_no_unique` ON `bets` (`ticket_no`);--> statement-breakpoint
CREATE TABLE `invite_codes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`max_uses` integer NOT NULL,
	`used_count` integer DEFAULT 0 NOT NULL,
	`expires_at` text NOT NULL,
	`created_by` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invite_codes_code_unique` ON `invite_codes` (`code`);--> statement-breakpoint
CREATE TABLE `lines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`match_id` integer NOT NULL,
	`version` integer NOT NULL,
	`fav_side` text NOT NULL,
	`ball_q` integer NOT NULL,
	`price_c` integer NOT NULL,
	`status` text NOT NULL,
	`posted_by` integer NOT NULL,
	`posted_at` text NOT NULL,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`posted_by`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lines_match_id_version_unique` ON `lines` (`match_id`,`version`);--> statement-breakpoint
CREATE TABLE `match_days` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`closed_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `match_days_date_unique` ON `match_days` (`date`);--> statement-breakpoint
CREATE TABLE `matches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`stage` text NOT NULL,
	`home_team` text NOT NULL,
	`away_team` text NOT NULL,
	`kickoff_utc` text NOT NULL,
	`venue` text NOT NULL,
	`match_day` text NOT NULL,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`home_score` integer,
	`away_score` integer,
	`score_confirmed_at` text,
	`bet_limit_mmk` integer,
	`external_api_id` text
);
--> statement-breakpoint
CREATE TABLE `players` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`phone` text NOT NULL,
	`pin_hash` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text DEFAULT 'player' NOT NULL,
	`language` text DEFAULT 'en' NOT NULL,
	`failed_pin_attempts` integer DEFAULT 0 NOT NULL,
	`locked_until` text,
	`must_change_pin` integer DEFAULT false NOT NULL,
	`session_epoch` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `players_phone_unique` ON `players` (`phone`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`daily_total_limit_mmk` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settlements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ref` text NOT NULL,
	`match_day_id` integer NOT NULL,
	`player_id` integer NOT NULL,
	`net_mmk` integer NOT NULL,
	`marked_by` integer NOT NULL,
	`marked_at` text NOT NULL,
	FOREIGN KEY (`match_day_id`) REFERENCES `match_days`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`marked_by`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `settlements_ref_unique` ON `settlements` (`ref`);--> statement-breakpoint
CREATE UNIQUE INDEX `settlements_match_day_id_player_id_unique` ON `settlements` (`match_day_id`,`player_id`);