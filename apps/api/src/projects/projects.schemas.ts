import { compositionVariablesSchema, PROJECT_KINDS, RENDER_FORMATS } from "@studio/shared";
import { z } from "zod";

export const createProjectSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/, "lettres minuscules, chiffres et tirets"),
  workflow: z
    .enum([
      "product-launch-video",
      "faceless-explainer",
      "motion-graphics",
      "music-to-video",
      "general-video",
      "embedded-captions",
      "talking-head-recut",
    ])
    .default("general-video"),
  /** Fixed at creation: a template proposes variables after the brief and is then used as iterations. */
  kind: z.enum(PROJECT_KINDS).default("oneshot"),
  brandId: z.string().uuid().optional(),
  brief: z.record(z.string(), z.unknown()).default({}),
});
export type CreateProject = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = createProjectSchema.pick({ name: true, brief: true, brandId: true }).partial();
export type UpdateProject = z.infer<typeof updateProjectSchema>;

export const listProjectsQuerySchema = z.object({ kind: z.enum(PROJECT_KINDS).optional() });
export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;

export const variablesSchema = z.object({ variables: compositionVariablesSchema });
export type VariablesBody = z.infer<typeof variablesSchema>;

export const feedbackSchema = z.object({ text: z.string().min(1).max(10_000) });

export const renderRequestSchema = z.object({
  format: z.enum(RENDER_FORMATS).default("mp4"),
  variables: z.record(z.string(), z.unknown()).optional(),
  at: z.array(z.number().nonnegative()).max(20).optional(),
  frames: z.number().int().min(1).max(10).optional(),
});
export type RenderRequest = z.infer<typeof renderRequestSchema>;
