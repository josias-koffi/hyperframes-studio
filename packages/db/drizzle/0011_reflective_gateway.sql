CREATE TYPE "public"."user_role" AS ENUM('admin', 'user');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'suspended');--> statement-breakpoint
CREATE TABLE "auth_magic_links" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"consent" jsonb,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "owner_id" uuid;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "owner_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" "user_role" DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "status" "user_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "consent" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "sessions_valid_from" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "auth_magic_links_email_idx" ON "auth_magic_links" USING btree ("email");--> statement-breakpoint
CREATE INDEX "auth_magic_links_expires_idx" ON "auth_magic_links" USING btree ("expires_at");--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assets_owner_idx" ON "assets" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "projects_owner_idx" ON "projects" USING btree ("owner_id","updated_at");