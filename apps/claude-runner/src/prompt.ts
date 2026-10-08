import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { CreationKind, CreationType, GenerationStep } from "@studio/shared";

export type PromptContext = {
  step: GenerationStep;
  type: CreationType;
  kind: CreationKind;
  slug: string;
  workflow: string;
  brief: Record<string, unknown>;
  /** Canvas size; null keeps the frame of the uploaded footage. */
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  slideCount: number | null;
  /** Name and shared context of the project the création belongs to. */
  campaign: string;
  feedback?: string;
};

/** `{{name}}` placeholders; an unknown placeholder is an authoring error of the prompt file. */
export function renderTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z]+)\s*\}\}/g, (_, key: string) => {
    if (!(key in values)) throw new Error(`unknown prompt placeholder {{${key}}}`);
    return values[key];
  });
}

/** Steps a template's variable contract (`prompts/partials/template.md`) applies to. */
const CONTRACT_STEPS: readonly GenerationStep[] = ["storyboard", "build"];

/** The format of the création, appended to every prompt: what a step produces depends on it. */
function formatPartial(context: PromptContext): string {
  if (context.type === "video" && (context.width === null || context.height === null)) return "video-source.md";
  return `${context.type}.md`;
}

/**
 * The prompt of a step comes from `prompts/<step>.md`. With feedback, the same
 * session is resumed on the same step and `prompts/feedback.md` wraps the
 * user's comment instead. Every prompt ends with the format of the création; a
 * template's storyboard and build also get its variable contract.
 */
export async function buildPrompt(promptsDir: string, context: PromptContext): Promise<string> {
  const file = context.feedback ? "feedback.md" : `${context.step}.md`;
  let template = await readFile(join(promptsDir, file), "utf8");
  template += await readFile(join(promptsDir, "partials", formatPartial(context)), "utf8");
  if (context.kind === "template" && CONTRACT_STEPS.includes(context.step)) {
    template += await readFile(join(promptsDir, "partials", "template.md"), "utf8");
  }
  return renderTemplate(template, {
    step: context.step,
    type: context.type,
    slug: context.slug,
    dir: `videos/${context.slug}`,
    workflow: context.workflow,
    brief: JSON.stringify(context.brief, null, 2),
    campaign: context.campaign.replace(/\n/g, "\n> "),
    width: String(context.width ?? ""),
    height: String(context.height ?? ""),
    duration: String(context.durationSeconds ?? ""),
    slides: String(context.slideCount ?? ""),
    feedback: context.feedback ?? "",
  });
}
