ALTER TABLE "jobs" DROP CONSTRAINT "jobs_template_id_templates_id_fk";
--> statement-breakpoint
ALTER TABLE "renders" DROP CONSTRAINT "renders_template_id_templates_id_fk";
--> statement-breakpoint
ALTER TABLE "jobs" DROP COLUMN "template_id";--> statement-breakpoint
ALTER TABLE "renders" DROP COLUMN "template_id";