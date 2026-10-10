ALTER TABLE "auth_magic_links" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "auth_magic_links" CASCADE;--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_agent_uid_unique";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "agent_uid";--> statement-breakpoint
DROP SEQUENCE "public"."agent_uid_seq";