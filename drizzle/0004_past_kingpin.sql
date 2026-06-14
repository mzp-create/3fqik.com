ALTER TABLE `bets` ADD `fee_mmk` integer;--> statement-breakpoint
ALTER TABLE `settings` ADD `commission_pct` integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `discount_pct` integer DEFAULT 2 NOT NULL;