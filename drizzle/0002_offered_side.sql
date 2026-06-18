ALTER TABLE "lines" ADD COLUMN "offered_side" text DEFAULT 'fav' NOT NULL;
--> statement-breakpoint
UPDATE "lines" SET "offered_side" = 'over' WHERE "market" = 'ou';
