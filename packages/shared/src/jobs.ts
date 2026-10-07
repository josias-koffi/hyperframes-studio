import { z } from "zod";

/**
 * The cadrage of a video, one Claude turn per step. A checkpoint step stops and
 * waits for the user: approving moves to the next step, a comment resumes the
 * same session (`claude --resume`) on the same step.
 */
export const GENERATION_STEPS = ["brief", "storyboard", "media", "build"] as const;
export type GenerationStep = (typeof GENERATION_STEPS)[number];

export const CHECKPOINT_STEPS: readonly GenerationStep[] = ["storyboard", "build"];

export function nextStep(step: GenerationStep): GenerationStep | null {
  const index = GENERATION_STEPS.indexOf(step);
  return GENERATION_STEPS[index + 1] ?? null;
}

export const JOB_STATUSES = ["queued", "running", "waiting_review", "succeeded", "failed", "cancelled"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const claudeJobSchema = z.object({
  jobId: z.string().uuid(),
  projectId: z.string().uuid(),
  /** Folder name under `<workspace>/videos/`. */
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/),
  step: z.enum(GENERATION_STEPS),
  /** Free-form feedback from the review UI; resumes the previous session when set. */
  feedback: z.string().max(10_000).optional(),
  /** Claude Code session to resume (`--resume`). */
  resumeSessionId: z.string().optional(),
});
export type ClaudeJob = z.infer<typeof claudeJobSchema>;

export const RENDER_FORMATS = ["mp4", "webm", "mov", "gif", "png"] as const;
export type RenderFormat = (typeof RENDER_FORMATS)[number];

export const renderJobSchema = z.object({
  jobId: z.string().uuid(),
  projectId: z.string().uuid(),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/),
  format: z.enum(RENDER_FORMATS).default("mp4"),
  /** Template render: the output is filed under the template, not under the source project's exports. */
  templateId: z.string().uuid().optional(),
  /** Template instantiation: values keyed by variable id (`render --variables-file`). */
  variables: z.record(z.string(), z.unknown()).optional(),
  /** For `png`: timestamps (seconds) captured with `hyperframes snapshot --at`. */
  at: z.array(z.number().nonnegative()).optional(),
  /** For `png` without `at`: how many images, spread over the composition by the worker. */
  frames: z.number().int().min(1).max(10).optional(),
});
export type RenderJob = z.infer<typeof renderJobSchema>;
