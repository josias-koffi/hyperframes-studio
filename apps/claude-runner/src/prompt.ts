import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { GenerationStep } from "@studio/shared";

export type PromptContext = {
  step: GenerationStep;
  slug: string;
  workflow: string;
  brief: Record<string, unknown>;
  feedback?: string;
};

/** `{{name}}` placeholders; an unknown placeholder is an authoring error of the prompt file. */
export function renderTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z]+)\s*\}\}/g, (_, key: string) => {
    if (!(key in values)) throw new Error(`unknown prompt placeholder {{${key}}}`);
    return values[key];
  });
}

/**
 * The prompt of a step comes from `prompts/<step>.md`. With feedback, the same
 * session is resumed on the same step and `prompts/feedback.md` wraps the
 * user's comment instead.
 */
export async function buildPrompt(promptsDir: string, context: PromptContext): Promise<string> {
  const file = context.feedback ? "feedback.md" : `${context.step}.md`;
  const template = await readFile(join(promptsDir, file), "utf8");
  return renderTemplate(template, {
    step: context.step,
    slug: context.slug,
    dir: `videos/${context.slug}`,
    workflow: context.workflow,
    brief: JSON.stringify(context.brief, null, 2),
    feedback: context.feedback ?? "",
  });
}
