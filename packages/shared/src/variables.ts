import { z } from "zod";

/**
 * HyperFrames composition variables, declared on the root `<html>` with
 * `data-composition-variables`. A template is a composition that declares them;
 * the studio builds its form from this schema and renders with
 * `hyperframes render --variables-file --strict-variables`.
 */
const base = { id: z.string().min(1), label: z.string().min(1) };

export const compositionVariableSchema = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("string"), default: z.string(), placeholder: z.string().optional(), maxLength: z.number().int().positive().optional() }),
  z.object({ ...base, type: z.literal("number"), default: z.number(), min: z.number().optional(), max: z.number().optional(), step: z.number().optional(), unit: z.string().optional() }),
  z.object({ ...base, type: z.literal("color"), default: z.string() }),
  z.object({ ...base, type: z.literal("boolean"), default: z.boolean() }),
  z.object({
    ...base,
    type: z.literal("enum"),
    default: z.string(),
    options: z.array(z.object({ value: z.string(), label: z.string() })).min(1),
  }),
]);
export type CompositionVariable = z.infer<typeof compositionVariableSchema>;

const ATTRIBUTE = /data-composition-variables\s*=\s*(['"])([\s\S]*?)\1/;

function decodeEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** Reads the variable declarations of a composition's `index.html`. Empty when it declares none. */
export function parseCompositionVariables(html: string): CompositionVariable[] {
  const match = ATTRIBUTE.exec(html);
  if (!match) return [];
  const raw: unknown = JSON.parse(decodeEntities(match[2]));
  return z.array(compositionVariableSchema).parse(raw);
}

/** Checks user values against the declarations, the way `--strict-variables` does. */
export function validateVariableValues(
  declarations: CompositionVariable[],
  values: Record<string, unknown>,
): string[] {
  const errors: string[] = [];
  const byId = new Map(declarations.map((d) => [d.id, d]));
  for (const [key, value] of Object.entries(values)) {
    const declaration = byId.get(key);
    if (!declaration) {
      errors.push(`${key}: undeclared variable`);
      continue;
    }
    switch (declaration.type) {
      case "string":
      case "color":
        if (typeof value !== "string") errors.push(`${key}: expected a string`);
        else if (declaration.type === "string" && declaration.maxLength && value.length > declaration.maxLength)
          errors.push(`${key}: longer than ${declaration.maxLength}`);
        break;
      case "number":
        if (typeof value !== "number" || Number.isNaN(value)) errors.push(`${key}: expected a number`);
        else if ((declaration.min !== undefined && value < declaration.min) || (declaration.max !== undefined && value > declaration.max))
          errors.push(`${key}: out of range`);
        break;
      case "boolean":
        if (typeof value !== "boolean") errors.push(`${key}: expected a boolean`);
        break;
      case "enum":
        if (!declaration.options.some((o) => o.value === value)) errors.push(`${key}: not one of the options`);
        break;
    }
  }
  return errors;
}

/**
 * Returns the composition with the given values as variable defaults.
 * `hyperframes snapshot` has no `--variables` flag, so a template image is
 * captured from a copy of the composition rewritten this way.
 */
export function applyVariableDefaults(html: string, values: Record<string, unknown>): string {
  const match = ATTRIBUTE.exec(html);
  if (!match) return html;
  const declarations = parseCompositionVariables(html).map((declaration) =>
    declaration.id in values ? { ...declaration, default: values[declaration.id] } : declaration,
  );
  const encoded = JSON.stringify(declarations).replace(/&/g, "&amp;").replace(/'/g, "&#39;");
  return html.slice(0, match.index) + `data-composition-variables='${encoded}'` + html.slice(match.index + match[0].length);
}
