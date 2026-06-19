ALTER TABLE "bets" ADD COLUMN "price_c" integer;--> statement-breakpoint
ALTER TABLE "lines" ADD COLUMN "price_opp_c" integer;--> statement-breakpoint
-- Backfill: existing bets only ever bet the line's single offered side, and
-- bets.line_id pins the exact version. Snapshot each bet's price from its line
-- so grading stays correct after the cutover to bet.price_c. Legacy lines keep
-- price_opp_c NULL (no opposite side was ever offered).
UPDATE "bets" b SET "price_c" = l."price_c" FROM "lines" l WHERE b."line_id" = l."id";