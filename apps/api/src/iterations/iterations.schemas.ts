import { RENDER_FORMATS } from "@studio/shared";
import { z } from "zod";

const values = z.record(z.string(), z.unknown());

export const createIterationSchema = z.object({
  name: z.string().trim().min(1).max(120),
  /** Missing: the declared defaults. A duplicate passes the values of its source. */
  values: values.optional(),
  /** Defaults to the deliverable of the création. */
  format: z.enum(RENDER_FORMATS).optional(),
});
export type CreateIteration = z.infer<typeof createIterationSchema>;

export const updateIterationSchema = z
  .object({ name: z.string().trim().min(1).max(120), values, format: z.enum(RENDER_FORMATS) })
  .partial();
export type UpdateIteration = z.infer<typeof updateIterationSchema>;

export const renderIterationSchema = z.object({
  /** Defaults to the iteration's format. */
  format: z.enum(RENDER_FORMATS).optional(),
  frames: z.number().int().min(1).max(10).optional(),
});
export type RenderIteration = z.infer<typeof renderIterationSchema>;
