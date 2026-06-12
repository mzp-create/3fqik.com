ALTER TABLE `invite_codes` ADD `kind` text DEFAULT 'admin' NOT NULL;--> statement-breakpoint
ALTER TABLE `players` ADD `referred_by` integer REFERENCES players(id);--> statement-breakpoint
ALTER TABLE `settings` ADD `default_personal_invite_uses` integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `referral_bonus_mmk` integer DEFAULT 0 NOT NULL;
