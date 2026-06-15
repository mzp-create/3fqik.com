DROP INDEX `lines_match_id_version_unique`;--> statement-breakpoint
ALTER TABLE `lines` ADD `market` text DEFAULT 'ah' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `lines_match_id_market_version_unique` ON `lines` (`match_id`,`market`,`version`);