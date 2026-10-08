import { GENERATION_STEPS, JOB_STATUSES, PROJECT_KINDS, RENDER_FORMATS } from "@studio/shared";
import {
  bigint,
  bigserial,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const generationStep = pgEnum("generation_step", GENERATION_STEPS);
export const projectKind = pgEnum("project_kind", PROJECT_KINDS);
export const jobStatus = pgEnum("job_status", JOB_STATUSES);
export const jobKind = pgEnum("job_kind", ["claude", "render"]);
export const renderFormat = pgEnum("render_format", RENDER_FORMATS);
export const assetKind = pgEnum("asset_kind", ["image", "video", "audio", "font", "logo", "document", "other"]);
export const publicationStatus = pgEnum("publication_status", ["draft", "scheduled", "published", "failed"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  ...timestamps,
});

/** A brand = a reusable design system (palette, fonts, logos, frame.md). */
export const brands = pgTable("brands", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  /** Content of the `frame.md` design spec handed to every project of the brand. */
  frameSpec: text("frame_spec"),
  palette: jsonb("palette").$type<Record<string, string>>().notNull().default({}),
  ...timestamps,
});

/** One project = one HyperFrames video folder `<workspace>/videos/<slug>`. */
export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  brandId: uuid("brand_id").references(() => brands.id, { onDelete: "set null" }),
  /** HyperFrames workflow skill (product-launch-video, faceless-explainer…). */
  workflow: text("workflow").notNull().default("general-video"),
  /** Chosen at creation, never changed: a template validates variables and is instantiated as iterations. */
  kind: projectKind("kind").notNull().default("oneshot"),
  /** Brief fields, written to BRIEF.md frontmatter by the brief step. */
  brief: jsonb("brief").$type<Record<string, unknown>>().notNull().default({}),
  currentStep: generationStep("current_step").notNull().default("brief"),
  /** Claude Code session reused across the steps of this project (`--resume`). */
  claudeSessionId: text("claude_session_id"),
  ...timestamps,
});

export const assets = pgTable(
  "assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Null = shared library asset; set = belongs to one project. */
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id").references(() => brands.id, { onDelete: "cascade" }),
    kind: assetKind("kind").notNull(),
    filename: text("filename").notNull(),
    /** Object key in the MinIO bucket. */
    storageKey: text("storage_key").notNull().unique(),
    contentType: text("content_type").notNull(),
    size: bigint("size", { mode: "number" }).notNull(),
    tags: text("tags").array().notNull().default([]),
    ...timestamps,
  },
  (t) => [index("assets_project_idx").on(t.projectId)],
);

/** One use of a template: a named set of variable values and the renders made from it. */
export const iterations = pgTable(
  "iterations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Values keyed by variable id; missing keys fall back to the declared defaults. */
    values: jsonb("values").$type<Record<string, unknown>>().notNull().default({}),
    format: renderFormat("format").notNull().default("mp4"),
    ...timestamps,
  },
  (t) => [index("iterations_project_idx").on(t.projectId, t.updatedAt)],
);

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    kind: jobKind("kind").notNull(),
    step: generationStep("step"),
    /** Set on an iteration render: the job belongs to the iteration, not to the project's exports. */
    iterationId: uuid("iteration_id").references(() => iterations.id, { onDelete: "set null" }),
    status: jobStatus("status").notNull().default("queued"),
    /** The enqueued payload (ClaudeJob or RenderJob). */
    input: jsonb("input").$type<Record<string, unknown>>().notNull(),
    claudeSessionId: text("claude_session_id"),
    /** Final summary written by Claude, or the error. */
    resultText: text("result_text"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("jobs_project_idx").on(t.projectId, t.createdAt)],
);

/** Every StudioEvent of a job, so a page opened late can replay the log before going live. */
export const jobEvents = pgTable(
  "job_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    event: jsonb("event").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("job_events_job_seq_idx").on(t.jobId, t.seq)],
);

export const renders = pgTable("renders", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
  iterationId: uuid("iteration_id").references(() => iterations.id, { onDelete: "set null" }),
  format: renderFormat("format").notNull(),
  variables: jsonb("variables").$type<Record<string, unknown>>(),
  /** Object keys in MinIO: one for a video, several for PNG snapshots. */
  storageKeys: text("storage_keys").array().notNull().default([]),
  ...timestamps,
});

export const publications = pgTable("publications", {
  id: uuid("id").primaryKey().defaultRandom(),
  renderId: uuid("render_id")
    .notNull()
    .references(() => renders.id, { onDelete: "cascade" }),
  caption: text("caption").notNull().default(""),
  /** Postiz integration ids (one per social channel). */
  integrationIds: text("integration_ids").array().notNull().default([]),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  status: publicationStatus("status").notNull().default("draft"),
  postizPostId: text("postiz_post_id"),
  error: text("error"),
  ...timestamps,
});
