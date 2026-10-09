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

/** Ids become CSS custom properties (`--{id}`) and JSON keys: keep them to a safe identifier. */
export const VARIABLE_ID = /^[a-z][a-zA-Z0-9_]*$/;

/**
 * The variable contract of a template (`VARIABLES.json`): proposed by Claude
 * after the brief, edited and validated by the user, then declared as-is by the build.
 */
export const compositionVariablesSchema = z
  .array(compositionVariableSchema)
  .superRefine((variables, ctx) => {
    const seen = new Set<string>();
    variables.forEach((variable, index) => {
      if (!VARIABLE_ID.test(variable.id))
        ctx.addIssue({ code: "custom", path: [index, "id"], message: `${variable.id}: lettres, chiffres et _ uniquement, en commençant par une minuscule` });
      if (seen.has(variable.id)) ctx.addIssue({ code: "custom", path: [index, "id"], message: `${variable.id}: id en double` });
      seen.add(variable.id);
    });
  });

export interface VariablesDiff {
  /** Validated but not declared by the composition. */
  missing: string[];
  /** Declared by the composition but never validated. */
  extra: string[];
  /** Declared with another type than the validated one. */
  changed: string[];
}

/** Compares the validated contract with what the composition actually declares. */
export function diffVariables(validated: CompositionVariable[], declared: CompositionVariable[]): VariablesDiff {
  const declaredById = new Map(declared.map((variable) => [variable.id, variable]));
  const validatedIds = new Set(validated.map((variable) => variable.id));
  return {
    missing: validated.filter((variable) => !declaredById.has(variable.id)).map((variable) => variable.id),
    extra: declared.filter((variable) => !validatedIds.has(variable.id)).map((variable) => variable.id),
    changed: validated
      .filter((variable) => declaredById.has(variable.id) && declaredById.get(variable.id)!.type !== variable.type)
      .map((variable) => variable.id),
  };
}

/**
 * The contract with the defaults the composition declares (edited in the editor): same id and same type only,
 * the rest of the contract is kept.
 */
export function syncContractDefaults(validated: CompositionVariable[], declared: CompositionVariable[]): CompositionVariable[] {
  const declaredById = new Map(declared.map((variable) => [variable.id, variable]));
  return validated.map((variable) => {
    const twin = declaredById.get(variable.id);
    return twin && twin.type === variable.type ? ({ ...variable, default: twin.default } as CompositionVariable) : variable;
  });
}

export function isVariablesDiffEmpty(diff: VariablesDiff): boolean {
  return diff.missing.length === 0 && diff.extra.length === 0 && diff.changed.length === 0;
}

/** The values a new iteration starts from: every declared default. */
export function defaultVariableValues(declarations: CompositionVariable[]): Record<string, unknown> {
  return Object.fromEntries(declarations.map((declaration) => [declaration.id, declaration.default]));
}

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
