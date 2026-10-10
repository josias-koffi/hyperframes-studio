CREATE SEQUENCE "public"."agent_uid_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 199999 START WITH 100001 CACHE 1;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "agent_uid" integer DEFAULT nextval('agent_uid_seq') NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_agent_uid_unique" UNIQUE("agent_uid");