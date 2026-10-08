CREATE TYPE "public"."project_kind" AS ENUM('oneshot', 'template');--> statement-breakpoint
ALTER TYPE "public"."generation_step" ADD VALUE 'variables' BEFORE 'storyboard';--> statement-breakpoint
CREATE TABLE "iterations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"values" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"format" "render_format" DEFAULT 'mp4' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "iteration_id" uuid;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "kind" "project_kind" DEFAULT 'oneshot' NOT NULL;--> statement-breakpoint
ALTER TABLE "renders" ADD COLUMN "iteration_id" uuid;--> statement-breakpoint
ALTER TABLE "iterations" ADD CONSTRAINT "iterations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "iterations_project_idx" ON "iterations" USING btree ("project_id","updated_at");--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_iteration_id_iterations_id_fk" FOREIGN KEY ("iteration_id") REFERENCES "public"."iterations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renders" ADD CONSTRAINT "renders_iteration_id_iterations_id_fk" FOREIGN KEY ("iteration_id") REFERENCES "public"."iterations"("id") ON DELETE set null ON UPDATE no action;