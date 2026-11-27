CREATE TYPE "public"."menu_kind" AS ENUM('fixed', 'component');--> statement-breakpoint
CREATE TABLE "day_menu" (
	"date" date NOT NULL,
	"dish_id" uuid NOT NULL,
	"kind" "menu_kind" NOT NULL,
	CONSTRAINT "day_menu_date_dish_id_kind_pk" PRIMARY KEY("date","dish_id","kind")
);
--> statement-breakpoint
ALTER TABLE "day_menu" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "service_days" (
	"date" date PRIMARY KEY NOT NULL,
	"cutoff" integer,
	"locked_cutoff" integer,
	"closed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "service_days" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "day_menu" ADD CONSTRAINT "day_menu_date_service_days_date_fk" FOREIGN KEY ("date") REFERENCES "public"."service_days"("date") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_menu" ADD CONSTRAINT "day_menu_dish_id_dishes_id_fk" FOREIGN KEY ("dish_id") REFERENCES "public"."dishes"("id") ON DELETE no action ON UPDATE no action;