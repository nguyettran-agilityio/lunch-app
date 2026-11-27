CREATE TABLE "dish_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"min" integer NOT NULL,
	"max" integer NOT NULL,
	"included" integer NOT NULL,
	"extra_fee" integer NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "dish_groups_name_key_unique" UNIQUE("name_key") DEFERRABLE INITIALLY DEFERRED,
	CONSTRAINT "dish_groups_counts" CHECK (0 <= "dish_groups"."min" AND "dish_groups"."min" <= "dish_groups"."included" AND "dish_groups"."included" <= "dish_groups"."max" AND "dish_groups"."max" >= 1),
	CONSTRAINT "dish_groups_extra_fee" CHECK ("dish_groups"."extra_fee" >= 0)
);
--> statement-breakpoint
ALTER TABLE "dish_groups" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "dishes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"name_en" text,
	"description_en" text,
	"photo_path" text,
	"drawing" text,
	"price" integer,
	"group_id" uuid,
	"surcharge" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "dishes_name_key_unique" UNIQUE("name_key") DEFERRABLE INITIALLY DEFERRED,
	CONSTRAINT "dishes_money" CHECK (("dishes"."price" IS NULL OR "dishes"."price" >= 0) AND "dishes"."surcharge" >= 0),
	CONSTRAINT "dishes_kind" CHECK ("dishes"."price" IS NOT NULL OR "dishes"."group_id" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "dishes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "shop_settings" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"base_price" integer,
	"default_cutoff" integer,
	"bank_bin" text,
	"bank_account" text,
	"bank_holder" text,
	"reminder_seen_at" timestamp with time zone,
	CONSTRAINT "shop_settings_one_row" CHECK ("shop_settings"."id"),
	CONSTRAINT "shop_settings_base_price" CHECK ("shop_settings"."base_price" IS NULL OR "shop_settings"."base_price" >= 0)
);
--> statement-breakpoint
ALTER TABLE "shop_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "dishes" ADD CONSTRAINT "dishes_group_id_dish_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."dish_groups"("id") ON DELETE no action ON UPDATE no action;