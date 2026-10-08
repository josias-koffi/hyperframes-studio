import { z } from "zod";
import { SLIDE_COUNT, STILL_TIME, carouselTimes, type CreationKind, type CreationType } from "./creations";

/**
 * The cadrage of a création, one Claude turn per step. A checkpoint step stops and
 * waits for the user: approving moves to the next step, a comment resumes the
 * same session (`claude --resume`) on the same step.
 */
export const GENERATION_STEPS = ["brief", "variables", "storyboard", "media", "build"] as const;
export type GenerationStep = (typeof GENERATION_STEPS)[number];

export const CHECKPOINT_STEPS: readonly GenerationStep[] = ["variables", "storyboard", "build"];

export interface CreationShape {
  type: CreationType;
  kind: CreationKind;
}

/**
 * Steps a création goes through: only a template proposes variables, only a video
 * has a soundtrack, and a single image goes straight from the brief to the build.
 */
export function stepsFor({ type, kind }: CreationShape): readonly GenerationStep[] {
  return GENERATION_STEPS.filter((step) => {
    if (step === "variables") return kind === "template";
    if (step === "media") return type === "video";
    if (step === "storyboard") return type !== "image";
    return true;
  });
}

export function nextStep(step: GenerationStep, creation: CreationShape): GenerationStep | null {
  const steps = stepsFor(creation);
  return steps[steps.indexOf(step) + 1] ?? null;
}

export const JOB_STATUSES = ["queued", "running", "waiting_review", "succeeded", "failed", "cancelled"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

const slugSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/);

/** Jobs enqueued before créations existed carry `projectId`, which became the création id. */
function legacyProjectId(value: unknown): unknown {
  if (value && typeof value === "object" && !("creationId" in value) && "projectId" in value)
    return { ...value, creationId: (value as { projectId: unknown }).projectId };
  return value;
}

export const claudeJobSchema = z.preprocess(
  legacyProjectId,
  z.object({
    jobId: z.string().uuid(),
    creationId: z.string().uuid(),
    /** Folder name under `<workspace>/videos/`. */
    slug: slugSchema,
    step: z.enum(GENERATION_STEPS),
    /** Free-form feedback from the review UI; resumes the previous session when set. */
    feedback: z.string().max(10_000).optional(),
    /** Claude Code session to resume (`--resume`). */
    resumeSessionId: z.string().optional(),
  }),
);
export type ClaudeJob = z.infer<typeof claudeJobSchema>;

/** `pdf` = the slides of a carousel as PNG files plus one PDF assembling them. */
export const RENDER_FORMATS = ["mp4", "webm", "mov", "gif", "png", "pdf"] as const;
export type RenderFormat = (typeof RENDER_FORMATS)[number];

export const VIDEO_FORMATS: readonly RenderFormat[] = ["mp4", "webm", "mov", "gif"];

export function allowedFormats(type: CreationType): readonly RenderFormat[] {
  if (type === "image") return ["png"];
  if (type === "carousel") return ["pdf", "png"];
  return ["mp4", "webm", "mov", "gif", "png"];
}

export interface RenderRequest {
  format: RenderFormat;
  at?: number[];
}

/** What a création delivers once its build is approved, and what its iterations render. */
export function deliverableFor(creation: { type: CreationType; slideCount?: number | null }): RenderRequest {
  if (creation.type === "image") return { format: "png", at: [STILL_TIME] };
  if (creation.type === "carousel") return { format: "pdf", at: carouselTimes(creation.slideCount ?? SLIDE_COUNT.default) };
  return { format: "mp4" };
}

export const renderJobSchema = z.preprocess(
  legacyProjectId,
  z.object({
    jobId: z.string().uuid(),
    creationId: z.string().uuid(),
    slug: slugSchema,
    format: z.enum(RENDER_FORMATS).default("mp4"),
    /** Template render: the output is filed under this iteration, not under the création's exports. */
    iterationId: z.string().uuid().optional(),
    /** Template instantiation: values keyed by variable id (`render --variables-file`). */
    variables: z.record(z.string(), z.unknown()).optional(),
    /** For `png` and `pdf`: timestamps (seconds) captured with `hyperframes snapshot --at`. */
    at: z.array(z.number().nonnegative()).max(30).optional(),
    /** For `png` without `at`: how many images, spread over the composition by the worker. */
    frames: z.number().int().min(1).max(10).optional(),
  }),
);
export type RenderJob = z.infer<typeof renderJobSchema>;
