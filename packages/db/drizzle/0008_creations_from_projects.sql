-- A project used to be one video. It becomes the campaign holding that video as its only création,
-- under the same id: workspace folders, Studio links, render keys and old URLs keep resolving.
INSERT INTO "creations" ("id", "project_id", "slug", "name", "type", "kind", "workflow", "width", "height",
  "duration_seconds", "brief", "current_step", "claude_session_id", "created_at", "updated_at")
SELECT p."id", p."id", p."slug", p."name", 'video', p."kind", p."workflow",
  CASE WHEN p."brief"->>'aspect' ~ '^\d+x\d+$' THEN split_part(p."brief"->>'aspect', 'x', 1)::int END,
  CASE WHEN p."brief"->>'aspect' ~ '^\d+x\d+$' THEN split_part(p."brief"->>'aspect', 'x', 2)::int END,
  CASE WHEN p."brief"->>'length' ~ '^\d+s$' THEN rtrim(p."brief"->>'length', 's')::int END,
  p."brief" - 'aspect' - 'length', p."current_step", p."claude_session_id", p."created_at", p."updated_at"
FROM "projects" p;
--> statement-breakpoint
UPDATE "jobs" SET "creation_id" = "project_id";
--> statement-breakpoint
UPDATE "renders" SET "creation_id" = "project_id";
--> statement-breakpoint
UPDATE "iterations" SET "creation_id" = "project_id";
