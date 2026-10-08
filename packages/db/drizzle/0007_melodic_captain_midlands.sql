CREATE TYPE "public"."creation_type" AS ENUM('video', 'carousel', 'image');--> statement-breakpoint
ALTER TYPE "public"."render_format" ADD VALUE 'pdf';--> statement-breakpoint
CREATE TABLE "creations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"type" "creation_type" DEFAULT 'video' NOT NULL,
	"kind" "project_kind" DEFAULT 'oneshot' NOT NULL,
	"workflow" text DEFAULT 'general-video' NOT NULL,
	"width" integer,
	"height" integer,
	"duration_seconds" integer,
	"slide_count" integer,
	"brief" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"current_step" "generation_step" DEFAULT 'brief' NOT NULL,
	"claude_session_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "creation_id" uuid;--> statement-breakpoint
ALTER TABLE "iterations" ADD COLUMN "creation_id" uuid;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "creation_id" uuid;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "context" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "renders" ADD COLUMN "creation_id" uuid;--> statement-breakpoint
ALTER TABLE "creations" ADD CONSTRAINT "creations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "creations_project_idx" ON "creations" USING btree ("project_id","updated_at");--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_creation_id_creations_id_fk" FOREIGN KEY ("creation_id") REFERENCES "public"."creations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iterations" ADD CONSTRAINT "iterations_creation_id_creations_id_fk" FOREIGN KEY ("creation_id") REFERENCES "public"."creations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_creation_id_creations_id_fk" FOREIGN KEY ("creation_id") REFERENCES "public"."creations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renders" ADD CONSTRAINT "renders_creation_id_creations_id_fk" FOREIGN KEY ("creation_id") REFERENCES "public"."creations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "iterations_creation_idx" ON "iterations" USING btree ("creation_id","updated_at");--> statement-breakpoint
CREATE INDEX "jobs_creation_idx" ON "jobs" USING btree ("creation_id","created_at");