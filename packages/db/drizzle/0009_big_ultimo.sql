ALTER TABLE "projects" DROP CONSTRAINT "projects_slug_unique";--> statement-breakpoint
ALTER TABLE "iterations" DROP CONSTRAINT "iterations_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "jobs" DROP CONSTRAINT "jobs_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "renders" DROP CONSTRAINT "renders_project_id_projects_id_fk";
--> statement-breakpoint
DROP INDEX "iterations_project_idx";--> statement-breakpoint
DROP INDEX "jobs_project_idx";--> statement-breakpoint
ALTER TABLE "iterations" ALTER COLUMN "creation_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ALTER COLUMN "creation_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "renders" ALTER COLUMN "creation_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "iterations" DROP COLUMN "project_id";--> statement-breakpoint
ALTER TABLE "jobs" DROP COLUMN "project_id";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "slug";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "workflow";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "kind";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "brief";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "current_step";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "claude_session_id";--> statement-breakpoint
ALTER TABLE "renders" DROP COLUMN "project_id";