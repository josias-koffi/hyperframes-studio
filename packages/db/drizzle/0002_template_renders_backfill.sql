-- Template renders made before jobs.template_id existed were filed under their source project.
-- A render with variables came from a template; attach it (and its job) when the project has exactly one.
UPDATE "renders" r SET "template_id" = t."id"
FROM "templates" t
WHERE r."template_id" IS NULL
  AND r."variables" IS NOT NULL
  AND t."project_id" = r."project_id"
  AND (SELECT count(*) FROM "templates" t2 WHERE t2."project_id" = r."project_id") = 1;
--> statement-breakpoint
UPDATE "jobs" j SET "template_id" = t."id"
FROM "templates" t
WHERE j."template_id" IS NULL
  AND j."kind" = 'render'
  AND j."input" ? 'variables'
  AND t."project_id" = j."project_id"
  AND (SELECT count(*) FROM "templates" t2 WHERE t2."project_id" = j."project_id") = 1;
