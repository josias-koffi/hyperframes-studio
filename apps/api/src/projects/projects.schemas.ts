import { z } from "zod";

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(120),
  /** Shared by every création: audience, tone, offer, dates… */
  context: z.string().max(5_000).default(""),
  brandId: z.string().uuid().optional(),
});
export type CreateProject = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = createProjectSchema.partial();
export type UpdateProject = z.infer<typeof updateProjectSchema>;
