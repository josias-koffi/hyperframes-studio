import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  compositionVariablesSchema,
  diffVariables,
  parseCompositionVariables,
  type CompositionVariable,
  type VariablesDiff,
} from "@studio/shared";

/** The validated contract of a template, proposed by Claude at the `variables` step. */
export const VARIABLES_FILE = "VARIABLES.json";

export type ProjectVariables = {
  /** `VARIABLES.json`: null before the `variables` step. */
  proposed: CompositionVariable[] | null;
  /** `data-composition-variables` of `index.html`: what an iteration can actually change. */
  declared: CompositionVariable[];
  /** Null until both sides exist. */
  diff: VariablesDiff | null;
  /** A side that exists but cannot be read (bad JSON, unknown type…). */
  errors: string[];
};

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function readOptional(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

export async function readProjectVariables(workspaceDir: string, slug: string): Promise<ProjectVariables> {
  const dir = join(workspaceDir, "videos", slug);
  const errors: string[] = [];
  let proposed: CompositionVariable[] | null = null;
  let declared: CompositionVariable[] = [];

  const contract = await readOptional(join(dir, VARIABLES_FILE));
  if (contract !== null) {
    try {
      proposed = compositionVariablesSchema.parse(JSON.parse(contract));
    } catch (error) {
      errors.push(`${VARIABLES_FILE} : ${message(error)}`);
    }
  }
  const html = await readOptional(join(dir, "index.html"));
  if (html !== null) {
    try {
      declared = parseCompositionVariables(html);
    } catch (error) {
      errors.push(`index.html : ${message(error)}`);
    }
  }
  const diff = proposed && declared.length > 0 ? diffVariables(proposed, declared) : null;
  return { proposed, declared, diff, errors };
}

export async function writeProjectVariables(workspaceDir: string, slug: string, variables: CompositionVariable[]) {
  await writeFile(join(workspaceDir, "videos", slug, VARIABLES_FILE), `${JSON.stringify(variables, null, 2)}\n`);
}
