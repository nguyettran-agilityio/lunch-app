CREATE TYPE "public"."auth_method" AS ENUM('password', 'google');--> statement-breakpoint
CREATE TYPE "public"."building_state" AS ENUM('approved', 'pending', 'declined');--> statement-breakpoint
CREATE TYPE "public"."lang" AS ENUM('vi', 'en');--> statement-breakpoint
CREATE TYPE "public"."mail_kind" AS ENUM('confirm', 'reset', 'change');--> statement-breakpoint
CREATE TABLE "auth_mail_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"kind" "mail_kind" NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_mail_log_email_lower" CHECK ("auth_mail_log"."email" = lower("auth_mail_log"."email"))
);
--> statement-breakpoint
ALTER TABLE "auth_mail_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "buildings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"delivery_time" integer,
	"state" "building_state" NOT NULL,
	"proposed_by" uuid
);
--> statement-breakpoint
ALTER TABLE "buildings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text,
	"phone" text,
	"email" text NOT NULL,
	"building_id" uuid,
	"lang" "lang" DEFAULT 'vi' NOT NULL,
	"method" "auth_method" NOT NULL,
	"needs_password" boolean DEFAULT false NOT NULL,
	"pending_email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_phone_unique" UNIQUE("phone"),
	CONSTRAINT "profiles_email_unique" UNIQUE("email"),
	CONSTRAINT "profiles_pending_email_unique" UNIQUE("pending_email"),
	CONSTRAINT "profiles_phone_format" CHECK ("profiles"."phone" ~ '^0[35789][0-9]{8}$'),
	CONSTRAINT "profiles_email_lower" CHECK ("profiles"."email" = lower("profiles"."email")),
	CONSTRAINT "profiles_pending_email_lower" CHECK ("profiles"."pending_email" = lower("profiles"."pending_email"))
);
--> statement-breakpoint
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_proposed_by_profiles_id_fk" FOREIGN KEY ("proposed_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_mail_log_email_sent_at_idx" ON "auth_mail_log" USING btree ("email","sent_at");