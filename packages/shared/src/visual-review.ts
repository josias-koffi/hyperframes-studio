import { z } from "zod";
import { validateStoryboard, type BlockManifest, type Storyboard, type StoryboardFormat } from "./storyboard";

/**
 * The visual check of a build: a model with vision reads the contact sheet (one tile per scene) and lists what it
 * sees wrong. A fix it can express as new props is applied by the studio; the rest is shown in the review.
 */
export const visualIssueSchema = z.object({
  scene: z.string().regex(/^s[0-9]{1,2}$/),
  problem: z.string().min(1).max(300),
  severity: z.enum(["low", "medium", "high"]),
  /** New values for props of the scene's block, or null when props cannot fix it. */
  correction: z.object({ props: z.record(z.string(), z.string()) }).nullable(),
});
export type VisualIssue = z.infer<typeof visualIssueSchema>;

export const visualReviewSchema = z.object({ issues: z.array(visualIssueSchema).max(20) });
export type VisualReview = z.infer<typeof visualReviewSchema>;

export function visualReviewJsonSchema(): Record<string, unknown> {
  const json = z.toJSONSchema(visualReviewSchema, { io: "input" }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

export type ReviewedIssue = VisualIssue & { status: "applied" | "open"; reason?: string };

/**
 * Applies the corrections one issue at a time, keeping one only if the storyboard still passes: a correction may
 * only change existing props of the block, never a prop bound to a template variable. Returns the corrected
 * storyboard (null when nothing changed) and every issue with what became of it.
 */
export function applyVisualCorrections(
  storyboard: Storyboard,
  issues: readonly VisualIssue[],
  manifests: readonly BlockManifest[],
  format: StoryboardFormat,
): { storyboard: Storyboard | null; issues: ReviewedIssue[] } {
  const byId = new Map(manifests.map((manifest) => [manifest.id, manifest]));
  let current = storyboard;
  let changed = false;
  const reviewed: ReviewedIssue[] = [];
  for (const issue of issues) {
    const open = (reason?: string) => reviewed.push({ ...issue, status: "open", ...(reason ? { reason } : {}) });
    const scene = current.scenes.find((candidate) => candidate.id === issue.scene);
    const props = Object.entries(issue.correction?.props ?? {});
    if (!scene || props.length === 0) {
      open(scene ? undefined : `scène ${issue.scene} inconnue`);
      continue;
    }
    const manifest = byId.get(scene.block);
    const unknown = props.filter(([key]) => !manifest?.props[key]).map(([key]) => key);
    const bound = props.filter(([key]) => scene.variables?.[key]).map(([key]) => key);
    if (unknown.length || bound.length) {
      open(unknown.length ? `props inconnues du bloc ${scene.block} : ${unknown.join(", ")}` : `props liées à une variable du template : ${bound.join(", ")}`);
      continue;
    }
    const next: Storyboard = {
      ...current,
      scenes: current.scenes.map((candidate) => (candidate.id === scene.id ? { ...candidate, props: { ...candidate.props, ...Object.fromEntries(props) } } : candidate)),
    };
    const { errors } = validateStoryboard(next, manifests, format);
    if (errors.length) {
      open(`correction refusée : ${errors.join(" ; ")}`);
      continue;
    }
    current = next;
    changed = true;
    reviewed.push({ ...issue, status: "applied" });
  }
  return { storyboard: changed ? current : null, issues: reviewed };
}
