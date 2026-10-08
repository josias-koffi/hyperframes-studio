-- Templates used to be saved after the fact from a finished project. The project becomes a
-- template project and each saved template becomes one iteration (same id) holding its renders.
UPDATE "projects" SET "kind" = 'template'
WHERE "id" IN (SELECT "project_id" FROM "templates");
--> statement-breakpoint
INSERT INTO "iterations" ("id", "project_id", "name", "values", "format", "created_at", "updated_at")
SELECT t."id", t."project_id", 'Historique · ' || t."name",
  COALESCE(
    (SELECT r."variables" FROM "renders" r
     WHERE r."template_id" = t."id" AND r."variables" IS NOT NULL
     ORDER BY r."created_at" DESC LIMIT 1),
    '{}'::jsonb),
  'mp4', t."created_at", t."updated_at"
FROM "templates" t;
--> statement-breakpoint
UPDATE "renders" SET "iteration_id" = "template_id" WHERE "template_id" IS NOT NULL;
--> statement-breakpoint
UPDATE "jobs" SET "iteration_id" = "template_id" WHERE "template_id" IS NOT NULL;
