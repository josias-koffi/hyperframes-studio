ALTER TABLE "ai_models" ADD COLUMN "capabilities" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "escalation_model" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "escalation_cost_usd" numeric(12, 6);