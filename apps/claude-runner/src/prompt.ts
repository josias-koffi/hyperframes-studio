import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { type CreationKind, type CreationType, type GenerationStep } from "@studio/shared";

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

/** What each video style of the form reads in the `/hyperframes` skill, which replaced the skills named after them. */
const STYLE_GUIDES: Record<string, string> = {
  "product-launch-video": "types/launch.md",
  "faceless-explainer": "types/explainer.md",
  "motion-graphics": "motion.md",
  "music-to-video": "types/music.md",
  "general-video": "film.md",
  "embedded-captions": "captions.md",
  "talking-head-recut": "overlays.md",
};

/** `{{name}}` placeholders; an unknown placeholder is an authoring error of the prompt file. */
export function renderTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z]+)\s*\}\}/g, (_, key: string) => {
    if (!(key in values)) throw new Error(`unknown prompt placeholder {{${key}}}`);
    return values[key];
  });
}

/**
 * Steps that write compositions get the key HyperFrames rules in the prompt (`prompts/partials/rules.md`): a step
 * runs in a new session and a weak model does not always read the skills.
 */
const RULES_STEPS: readonly GenerationStep[] = ["build"];

/**
 * Steps that choose or place what the création shows get the asset library (`prompts/partials/library.md`): the
 * storyboard names the assets, the build adds them. Review comments of those steps included.
 */
const LIBRARY_STEPS: readonly GenerationStep[] = ["storyboard", "build"];

/** Steps a template's variable contract (`prompts/partials/template.md`) applies to. */
const CONTRACT_STEPS: readonly GenerationStep[] = ["storyboard", "build"];

/** The format of the création, appended to every prompt: what a step produces depends on it. */
function formatPartial(context: PromptContext): string {
  if (context.type === "video" && (context.width === null || context.height === null)) return "video-source.md";
  return `${context.type}.md`;
}

/**
 * The prompt of a step comes from `prompts/<step>.md`, in a new session that reads the validated files of the
 * previous steps. With feedback, the step's session is resumed and `prompts/feedback.md` wraps the user's comment
 * instead. Every prompt ends with the format of the création; a template's storyboard and build also get its
 * variable contract, the storyboard and the build the asset library, and the build the key HyperFrames rules.
 */
export async function buildPrompt(promptsDir: string, context: PromptContext): Promise<string> {
  const file = context.feedback ? "feedback.md" : `${context.step}.md`;
  let template = await readFile(join(promptsDir, file), "utf8");
  template += await readFile(join(promptsDir, "partials", formatPartial(context)), "utf8");
  if (context.kind === "template" && CONTRACT_STEPS.includes(context.step)) {
    template += await readFile(join(promptsDir, "partials", "template.md"), "utf8");
  }
  if (LIBRARY_STEPS.includes(context.step)) template += await readFile(join(promptsDir, "partials", "library.md"), "utf8");
  if (RULES_STEPS.includes(context.step)) template += await readFile(join(promptsDir, "partials", "rules.md"), "utf8");
  return renderTemplate(template, {
    step: context.step,
    type: context.type,
    slug: context.slug,
    dir: `videos/${context.slug}`,
    guide: `~/.claude/skills/hyperframes/references/${STYLE_GUIDES[context.workflow] ?? "film.md"}`,
    brief: JSON.stringify(context.brief, null, 2),
    campaign: context.campaign.replace(/\n/g, "\n> "),
    width: String(context.width ?? ""),
    height: String(context.height ?? ""),
    duration: String(context.durationSeconds ?? ""),
    slides: String(context.slideCount ?? ""),
    feedback: context.feedback ?? "",
  });
}
