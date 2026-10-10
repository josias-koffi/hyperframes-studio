CREATE TYPE "public"."agent_backend" AS ENUM('opencode', 'claude-code');--> statement-breakpoint
CREATE TYPE "public"."ai_model_kind" AS ENUM('agent', 'tts', 'music');--> statement-breakpoint
CREATE TABLE "ai_defaults" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"preferences" jsonb DEFAULT '{"models":{},"media":{}}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"openrouter_id" text NOT NULL,
	"kind" "ai_model_kind" NOT NULL,
	"label" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"voices" text[] DEFAULT '{}' NOT NULL,
	"pricing" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"context_length" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_ai_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"preferences" jsonb DEFAULT '{"models":{},"media":{}}'::jsonb NOT NULL,
	"agent_backend" "agent_backend" DEFAULT 'opencode' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "creations" ADD COLUMN "session_backend" "agent_backend";--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "backend" "agent_backend";--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "cost_usd" numeric(12, 6);--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "input_tokens" integer;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "output_tokens" integer;--> statement-breakpoint
ALTER TABLE "user_ai_settings" ADD CONSTRAINT "user_ai_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_models_openrouter_kind_idx" ON "ai_models" USING btree ("openrouter_id","kind");--> statement-breakpoint
CREATE INDEX "jobs_created_idx" ON "jobs" USING btree ("created_at");