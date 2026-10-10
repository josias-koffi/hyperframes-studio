import {
  AGENT_BACKENDS,
  AI_MODEL_KINDS,
  CREATION_KINDS,
  CREATION_TYPES,
  GENERATION_STEPS,
  JOB_STATUSES,
  RENDER_FORMATS,
  type AiPreferences,
} from "@studio/shared";
import {
  bigint,
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
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
/** Named before créations existed, when a project was one video: holds oneshot | template. */
export const creationKind = pgEnum("project_kind", CREATION_KINDS);
export const creationType = pgEnum("creation_type", CREATION_TYPES);
export const jobStatus = pgEnum("job_status", JOB_STATUSES);
export const jobKind = pgEnum("job_kind", ["claude", "render"]);
export const renderFormat = pgEnum("render_format", RENDER_FORMATS);
export const assetKind = pgEnum("asset_kind", [
  "image",
  "video",
  "audio",
  "font",
  "logo",
  "document",
  "other",
]);
export const publicationStatus = pgEnum("publication_status", [
  "draft",
  "scheduled",
  "published",
  "failed",
]);

export const agentBackend = pgEnum("agent_backend", AGENT_BACKENDS);
export const aiModelKind = pgEnum("ai_model_kind", AI_MODEL_KINDS);

export const userRole = pgEnum("user_role", ["admin", "user"]);
export const userStatus = pgEnum("user_status", ["active", "suspended"]);

/** What the person agreed to when the account was created (`passwordless`: an account of the former web studio). */
export type UserConsent = { acceptedAt: string; source: "passwordless" | "desktop"; version: string };

/** The person of the app, created at its first start (no password is ever stored). */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  role: userRole("role").notNull().default("user"),
  status: userStatus("status").notNull().default("active"),
  consent: jsonb("consent").$type<UserConsent>(),
  /** Sessions issued before this instant are refused (forced logout, suspension). Null: none revoked. */
  sessionsValidFrom: timestamp("sessions_valid_from", { withTimezone: true }),
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

/** A project = a campaign: it groups créations (videos, carousels, images) and their shared assets. */
export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Who sees the campaign and everything in it. Null only for rows older than accounts: nobody sees them. */
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    brandId: uuid("brand_id").references(() => brands.id, { onDelete: "set null" }),
    /** Campaign context shared by every création of the project (audience, tone, offer…). */
    context: text("context").notNull().default(""),
    ...timestamps,
  },
  (t) => [index("projects_owner_idx").on(t.ownerId, t.updatedAt)],
);

/** One création = one HyperFrames folder `<workspace>/videos/<slug>`, one Claude session, one deliverable. */
export const creations = pgTable(
  "creations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    type: creationType("type").notNull().default("video"),
    /** Chosen at creation, never changed: a template validates variables and is instantiated as iterations. */
    kind: creationKind("kind").notNull().default("oneshot"),
    /** HyperFrames workflow skill (product-launch-video, faceless-explainer…). */
    workflow: text("workflow").notNull().default("general-video"),
    /** Canvas size; null keeps the frame of the uploaded footage. */
    width: integer("width"),
    height: integer("height"),
    /** Video only. */
    durationSeconds: integer("duration_seconds"),
    /** Carousel only. */
    slideCount: integer("slide_count"),
    /** Brief fields, written to BRIEF.md frontmatter by the brief step. */
    brief: jsonb("brief").$type<Record<string, unknown>>().notNull().default({}),
    currentStep: generationStep("current_step").notNull().default("brief"),
    /** Agent session reused across the steps of this création (Claude Code `--resume`, or OpenCode). */
    claudeSessionId: text("claude_session_id"),
    /** Who opened that session: a session is only resumed by the backend that opened it. Null: Claude Code. */
    sessionBackend: agentBackend("session_backend"),
    ...timestamps,
  },
  (t) => [index("creations_project_idx").on(t.projectId, t.updatedAt)],
);

export const assets = pgTable(
  "assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Whose library or campaign it is in, so the library (no project) is private too. */
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "cascade" }),
    /** Null = the owner's library asset; set = belongs to one project (campaign). */
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    /** Set = uploaded for one création only (its footage, its music). */
    creationId: uuid("creation_id").references(() => creations.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id").references(() => brands.id, { onDelete: "cascade" }),
    kind: assetKind("kind").notNull(),
    filename: text("filename").notNull(),
    /** Key of the file in the storage folder. */
    storageKey: text("storage_key").notNull().unique(),
    contentType: text("content_type").notNull(),
    size: bigint("size", { mode: "number" }).notNull(),
    tags: text("tags").array().notNull().default([]),
    ...timestamps,
  },
  (t) => [index("assets_project_idx").on(t.projectId), index("assets_owner_idx").on(t.ownerId)],
);

/** One use of a template: a named set of variable values and the renders made from it. */
export const iterations = pgTable(
  "iterations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    creationId: uuid("creation_id")
      .notNull()
      .references(() => creations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Values keyed by variable id; missing keys fall back to the declared defaults. */
    values: jsonb("values").$type<Record<string, unknown>>().notNull().default({}),
    format: renderFormat("format").notNull().default("mp4"),
    ...timestamps,
  },
  (t) => [index("iterations_creation_idx").on(t.creationId, t.updatedAt)],
);

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    creationId: uuid("creation_id")
      .notNull()
      .references(() => creations.id, { onDelete: "cascade" }),
    kind: jobKind("kind").notNull(),
    step: generationStep("step"),
    /** Set on an iteration render: the job belongs to the iteration, not to the création's exports. */
    iterationId: uuid("iteration_id").references(() => iterations.id, { onDelete: "set null" }),
    status: jobStatus("status").notNull().default("queued"),
    /** The enqueued payload (ClaudeJob or RenderJob). */
    input: jsonb("input").$type<Record<string, unknown>>().notNull(),
    claudeSessionId: text("claude_session_id"),
    /** Backend and model the job ran on (generation jobs only). */
    backend: agentBackend("backend"),
    model: text("model"),
    /** Cost reported by the backend for the turn (USD); on Claude Code it is the API price, not a bill. */
    costUsd: numeric("cost_usd", { precision: 12, scale: 6, mode: "number" }),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    /** Final summary written by Claude, or the error. */
    resultText: text("result_text"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("jobs_creation_idx").on(t.creationId, t.createdAt), index("jobs_created_idx").on(t.createdAt)],
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
  creationId: uuid("creation_id")
    .notNull()
    .references(() => creations.id, { onDelete: "cascade" }),
  jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
  iterationId: uuid("iteration_id").references(() => iterations.id, { onDelete: "set null" }),
  format: renderFormat("format").notNull(),
  variables: jsonb("variables").$type<Record<string, unknown>>(),
  /** Keys of the files in the storage folder: one for a video, several for PNG snapshots. */
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

/** The models an admin offers: agents for the generation steps, voices (TTS) and music for the media step. */
export const aiModels = pgTable(
  "ai_models",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** OpenRouter id (`vendor/model`). */
    openrouterId: text("openrouter_id").notNull(),
    kind: aiModelKind("kind").notNull(),
    label: text("label").notNull(),
    description: text("description").notNull().default(""),
    enabled: boolean("enabled").notNull().default(true),
    /** TTS only: the voices users may pick. */
    voices: text("voices").array().notNull().default([]),
    /** Prices copied from OpenRouter when imported (USD per token, as strings). */
    pricing: jsonb("pricing").$type<Record<string, string>>().notNull().default({}),
    contextLength: integer("context_length"),
    ...timestamps,
  },
  (t) => [uniqueIndex("ai_models_openrouter_kind_idx").on(t.openrouterId, t.kind)],
);

/** Platform defaults (a single row, `id = 'default'`): what a user gets for every slot they leave empty. */
export const aiDefaults = pgTable("ai_defaults", {
  id: text("id").primaryKey().default("default"),
  preferences: jsonb("preferences").$type<AiPreferences>().notNull().default({ models: {}, media: {} }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** A user's own choices, each slot falling back to the platform defaults. */
export const userAiSettings = pgTable("user_ai_settings", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  preferences: jsonb("preferences").$type<AiPreferences>().notNull().default({ models: {}, media: {} }),
  /** `claude-code` is only accepted for an admin (their own Claude Code subscription). */
  agentBackend: agentBackend("agent_backend").notNull().default("opencode"),
  ...timestamps,
});
