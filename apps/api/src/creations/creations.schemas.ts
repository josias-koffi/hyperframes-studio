import {
  ASPECTS,
  ASPECTS_BY_TYPE,
  compositionVariablesSchema,
  CREATION_KINDS,
  CREATION_TYPES,
  RENDER_FORMATS,
  SLIDE_COUNT,
  type Aspect,
} from "@studio/shared";
import { z } from "zod";

export const WORKFLOWS = [
  "product-launch-video",
  "faceless-explainer",
  "motion-graphics",
  "music-to-video",
  "general-video",
  "embedded-captions",
  "talking-head-recut",
] as const;

const slugSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/, "lettres minuscules, chiffres et tirets");

export const createCreationSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    /** Folder name under `videos/`; derived from the name when missing, suffixed when taken. */
    slug: slugSchema.optional(),
    type: z.enum(CREATION_TYPES).default("video"),
    /** Fixed at creation: a template proposes variables after the brief and is then used as iterations. */
    kind: z.enum(CREATION_KINDS).default("oneshot"),
    workflow: z.enum(WORKFLOWS).default("general-video"),
    /** Missing for a video made from footage: the footage gives the frame. */
    aspect: z.enum(Object.keys(ASPECTS) as [Aspect, ...Aspect[]]).optional(),
    durationSeconds: z.number().int().min(3).max(600).optional(),
    slideCount: z.number().int().min(SLIDE_COUNT.min).max(SLIDE_COUNT.max).optional(),
    brief: z.record(z.string(), z.unknown()).default({}),
  })
  .superRefine((input, ctx) => {
    if (input.aspect && !ASPECTS_BY_TYPE[input.type].includes(input.aspect))
      ctx.addIssue({ code: "custom", path: ["aspect"], message: `Format ${input.aspect} indisponible pour ce type de création.` });
    if (input.type !== "video" && !input.aspect)
      ctx.addIssue({ code: "custom", path: ["aspect"], message: "Un carrousel ou une image a besoin d'un format." });
  });
export type CreateCreation = z.infer<typeof createCreationSchema>;

/** The row to insert: canvas in pixels, and only the settings that apply to the type. */
export function creationValues(projectId: string, slug: string, input: CreateCreation) {
  const size = input.aspect ? ASPECTS[input.aspect] : null;
  return {
    projectId,
    slug,
    name: input.name,
    type: input.type,
    kind: input.kind,
    // Stills have no workflow of their own: general-video covers static title cards and layouts.
    workflow: input.type === "video" ? input.workflow : "general-video",
    width: size?.width ?? null,
    height: size?.height ?? null,
    durationSeconds: input.type === "video" ? (input.durationSeconds ?? null) : null,
    slideCount: input.type === "carousel" ? (input.slideCount ?? SLIDE_COUNT.default) : null,
    brief: input.brief,
  };
}

/** `base`, else `base-2`, `base-3`…: folders are global to the workspace and never renamed. */
export function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
  const root = base.slice(0, 58) || "creation";
  if (!taken.has(root)) return root;
  for (let n = 2; ; n++) if (!taken.has(`${root}-${n}`)) return `${root}-${n}`;
}

export const updateCreationSchema = z.object({ name: z.string().trim().min(1).max(120), brief: z.record(z.string(), z.unknown()) }).partial();
export type UpdateCreation = z.infer<typeof updateCreationSchema>;

export const listCreationsQuerySchema = z.object({
  type: z.enum(CREATION_TYPES).optional(),
  kind: z.enum(CREATION_KINDS).optional(),
});
export type ListCreationsQuery = z.infer<typeof listCreationsQuerySchema>;

export const variablesSchema = z.object({ variables: compositionVariablesSchema });
export type VariablesBody = z.infer<typeof variablesSchema>;

export const feedbackSchema = z.object({ text: z.string().min(1).max(10_000) });

export const renderRequestSchema = z.object({
  /** Defaults to the création's deliverable. */
  format: z.enum(RENDER_FORMATS).optional(),
  variables: z.record(z.string(), z.unknown()).optional(),
  at: z.array(z.number().nonnegative()).max(30).optional(),
  frames: z.number().int().min(1).max(10).optional(),
});
export type RenderRequestBody = z.infer<typeof renderRequestSchema>;
