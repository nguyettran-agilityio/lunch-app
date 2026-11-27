CREATE TABLE "used_reset_links" (
	"digest" text PRIMARY KEY NOT NULL,
	"used_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "used_reset_links" ENABLE ROW LEVEL SECURITY;