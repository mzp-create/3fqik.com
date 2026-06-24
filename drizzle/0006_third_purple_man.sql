CREATE TABLE "team_wiki" (
	"code" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"extract" text,
	"thumbnail_url" text,
	"article_url" text,
	"fifa_rank" integer,
	"confederation" text,
	"coach" text,
	"nickname" text,
	"recent_results" text,
	"fetched_at" text NOT NULL
);
