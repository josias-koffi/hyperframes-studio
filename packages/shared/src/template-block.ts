import { blockManifestSchema, fillBlock, type BlockManifest, type BlockProp, type LoadedBlock } from "./storyboard";
import type { CompositionVariable } from "./variables";

/** Where the blocks made from the user's templates live in the workspace: never touched by the app's sync. */
export const USER_BLOCKS_DIR = "blocks-user";

export type TemplateBlockInput = {
  /** The scene: a sub-composition (`<template>…</template>`) or the template's `index.html`. */
  html: string;
  /** The template's validated contract (`VARIABLES.json`). */
  variables: readonly CompositionVariable[];
  /** Seconds the scene lasts in the template. */
  duration: number;
  id: string;
  name: string;
  family?: string;
  description: string;
  useWhen: string;
};

export type TemplateBlockResult = { block: LoadedBlock; errors: [] } | { block: null; errors: string[] };

/**
 * The script a block made from a template ends with: a scene shorter than the template's plays the template's motion
 * faster (template length / scene length), so every entrance still happens in time; a longer one keeps its pace and
 * holds. The scene's timeline is nested in one the block registers in its place, so the pace holds however it is sought.
 */
export function templatePaceScript(sourceDuration: number): string {
  return `<script>
  (function () {
    // A scene shorter than the template's plays its motion faster, so that it all shows.
    const inner = window.__timelines["{{@id}}"];
    const source = ${sourceDuration};
    const slot = {{@duration}};
    if (!inner || slot >= source) return;
    const outer = gsap.timeline({ paused: true });
    inner.paused(false);
    outer.add(inner, 0);
    inner.timeScale(source / slot);
    window.__timelines["{{@id}}"] = outer;
  })();
</script>`;
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const r1 = (value: number) => Math.round(value * 10) / 10;

/** The scene's content: inside its `<template>`, or the body of a root composition with the styles of its head. */
function sceneContent(html: string): string {
  const template = /<template>([\s\S]*)<\/template>/.exec(html)?.[1];
  if (template) return template;
  const styles = [...(/<head>([\s\S]*?)<\/head>/.exec(html)?.[1] ?? "").matchAll(/<style[^>]*>[\s\S]*?<\/style>/g)].map((match) => match[0]);
  const body = /<body[^>]*>([\s\S]*)<\/body>/.exec(html)?.[1] ?? html;
  return `${styles.join("\n")}\n${body}`;
}

/** What a variable becomes in the block: an image when it fills a `src`, a text field for a string or a number. */
function propFor(variable: CompositionVariable, image: boolean): BlockProp {
  const base = { label: variable.label, required: false, bindable: true } as const;
  switch (variable.type) {
    case "color":
      return { ...base, type: "color", default: variable.default };
    case "enum":
      return { ...base, type: "enum", options: variable.options.map((option) => option.value), default: variable.default };
    case "boolean":
      return { ...base, type: "enum", options: ["true", "false"], default: String(variable.default) };
    case "number":
      return { ...base, type: "text", maxLength: 12, default: String(variable.default), bindable: false };
    case "string":
      if (image) return { ...base, type: "image", default: variable.default };
      return { ...base, type: "text", maxLength: variable.maxLength ?? Math.max(16, Math.ceil(variable.default.length * 1.5)), default: variable.default };
  }
}

/**
 * Turns a scene of a validated template into a block of the blocks engine: each variable the scene uses becomes a prop
 * (`data-var-text` → the element's text, `data-var-src` → its `src`, `var(--id)` → the value, `getVariables()` → the
 * values read from the block's root), its ids are prefixed with the block's (`{{@id}}-…`) so two scenes of the block
 * never clash, and its timeline is registered under the block's id. The block's example is the template's defaults.
 */
export function templateSceneToBlock(input: TemplateBlockInput): TemplateBlockResult {
  const errors: string[] = [];
  let html = sceneContent(input.html)
    // The page's own scripts (GSAP from a CDN) and the sound: the assembled video brings them.
    .replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g, "")
    .replace(/<audio\b[\s\S]*?<\/audio>/g, "")
    .replace(/<audio\b[^>]*\/>/g, "");

  const root = /<([a-z]+)\b([^>]*\bdata-composition-id="([^"]+)"[^>]*)>/.exec(html);
  if (!root) return { block: null, errors: ["la scène n'a pas d'élément racine avec data-composition-id"] };
  const compositionId = root[3];
  if (!new RegExp(`window\\.__timelines\\[\\s*["']${escapeRegExp(compositionId)}["']\\s*\\]\\s*=`).test(html))
    errors.push(`la scène n'enregistre pas sa timeline sous window.__timelines["${compositionId}"]`);
  html = html.replace(new RegExp(`(window\\.__timelines\\[\\s*)["']${escapeRegExp(compositionId)}["'](\\s*\\])`, "g"), '$1"{{@id}}"$2');
  const rootAttributes = root[2]
    .replace(/\s+(id|data-composition-id|data-width|data-height|data-start|data-duration|data-track-index|class)="[^"]*"/g, "")
    .trim();
  html = html.replace(root[0], `<${root[1]} id="root"${rootAttributes ? ` ${rootAttributes}` : ""} data-composition-id="{{@id}}" data-width="{{@width}}" data-height="{{@height}}">`);

  // Every other id gets the block's prefix, in the markup, the CSS and the scripts.
  const ids = [...new Set([...html.matchAll(/\sid="([^"{}]+)"/g)].map((match) => match[1]).filter((id) => id !== "root"))];
  for (const id of ids.sort((a, b) => b.length - a.length)) {
    const name = escapeRegExp(id);
    html = html
      .replace(new RegExp(`(\\sid=")${name}"`, "g"), `$1{{@id}}-${id}"`)
      .replace(new RegExp(`(getElementById\\(\\s*)(["'])${name}\\2`, "g"), `$1$2{{@id}}-${id}$2`)
      .replace(new RegExp(`#${name}(?![\\w-])`, "g"), `#{{@id}}-${id}`);
  }

  const props: Record<string, BlockProp> = {};
  const example: Record<string, string> = {};
  // A prop id is camelCase (`product_name` → `productName`); the variable it comes from, by prop id.
  const sources = new Map<string, CompositionVariable>();
  for (const variable of input.variables) {
    const name = escapeRegExp(variable.id);
    const key = variable.id.replace(/_+([a-zA-Z0-9])/g, (_, char: string) => char.toUpperCase()).replace(/_/g, "");
    const textBinding = new RegExp(`(<([a-z0-9]+)\\b[^>]*?)\\s+data-var-text="${name}"([^>]*>)([^<]*)`, "g");
    const srcBinding = new RegExp(`<[a-z0-9]+\\b[^>]*\\bdata-var-src="${name}"[^>]*>`, "g");
    const cssBinding = new RegExp(`var\\(\\s*--${name}\\s*(?:,[^()]*(?:\\([^()]*\\)[^()]*)*)?\\)`, "g");
    const scriptBinding = new RegExp(`\\b${name}\\b`);
    // Tested without the global flag, whose `lastIndex` would carry from one test to the next.
    const found = (pattern: RegExp) => new RegExp(pattern.source).test(html);
    const image = found(srcBinding);
    const used = found(textBinding) || image || found(cssBinding) || (/getVariables\(\)/.test(html) && scriptBinding.test(html));
    if (!used) continue;
    html = html
      .replace(textBinding, (_, open: string, _tag: string, rest: string) => `${open}${rest}{{${key}}}`)
      .replace(srcBinding, (tag) => {
        const bare = tag.replace(new RegExp(`\\s+data-var-src="${name}"`), "");
        return /\ssrc="[^"]*"/.test(bare) ? bare.replace(/\ssrc="[^"]*"/, ` src="{{${key}}}"`) : bare.replace(/^<([a-z0-9]+)/, `<$1 src="{{${key}}}"`);
      })
      .replace(cssBinding, `{{${key}}}`);
    props[key] = propFor(variable, image);
    example[key] = String(variable.default);
    sources.set(key, variable);
  }

  // A script that reads the variables gets them from the block's root, where the filled values are written.
  if (/window\.__hyperframes\.getVariables\(\)/.test(html)) {
    const keys = Object.keys(props);
    const attributes = keys.map((key) => ` data-tv-${key.toLowerCase()}="{{${key}}}"`).join("");
    html = html.replace(/<([a-z]+) id="root"/, `<$1 id="root"${attributes}`);
    const reader = `(function () { const root = document.querySelector('[data-composition-id="{{@id}}"]'); const read = (name) => root ? root.getAttribute("data-tv-" + name) : null; return { ${keys
      .map((key) => {
        // The script reads the template's names: the object keeps them.
        const variable = sources.get(key)!;
        const value = `read("${key.toLowerCase()}")`;
        if (variable.type === "number") return `"${variable.id}": Number(${value})`;
        if (variable.type === "boolean") return `"${variable.id}": ${value} === "true"`;
        return `"${variable.id}": ${value}`;
      })
      .join(", ")} }; })()`;
    html = html.replace(/window\.__hyperframes\.getVariables\(\)/g, reader);
  }
  const unbound = [...html.matchAll(/data-var-(text|src)="([^"]+)"/g)].map((match) => match[2]);
  if (unbound.length) errors.push(`variables liées mais absentes du contrat : ${[...new Set(unbound)].join(", ")}`);

  const duration = r1(Math.max(1, input.duration));
  const parsed = blockManifestSchema.safeParse({
    id: input.id,
    family: input.family || undefined,
    name: input.name,
    description: input.description,
    useWhen: input.useWhen,
    props,
    duration: { min: r1(Math.max(0.5, duration * 0.6)), max: r1(duration * 1.6), default: duration },
    example,
  });
  if (!parsed.success) errors.push(...parsed.error.issues.map((issue) => `${issue.path.join(".") || "bloc"} : ${issue.message}`));
  if (errors.length || !parsed.success) return { block: null, errors };

  const manifest: BlockManifest = parsed.data;
  const block: LoadedBlock = {
    manifest,
    html: `<!doctype html>\n<html>\n  <head>\n    <meta charset="UTF-8" />\n  </head>\n  <body>\n    <template>\n${html.trim()}\n${templatePaceScript(duration)}\n    </template>\n  </body>\n</html>\n`,
  };
  try {
    fillBlock(block, example, { id: "check", duration, width: 1080, height: 1920 });
  } catch (error) {
    return { block: null, errors: [error instanceof Error ? error.message : String(error)] };
  }
  return { block, errors: [] };
}
