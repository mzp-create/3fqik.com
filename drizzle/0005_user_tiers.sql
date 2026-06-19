ALTER TABLE "players" ADD COLUMN "tier" text DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "std_max_stake_mmk" bigint DEFAULT 500000 NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "std_outstanding_mmk" bigint DEFAULT 1000000 NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "std_max_bets_per_match" integer DEFAULT 2 NOT NULL;