import { z } from "zod";
import { compositionVariablesSchema, VARIABLE_ID } from "./variables";

/**
 * The brief of the blocks engine (`BRIEF.json`), written by a structured call from what was typed in the studio.
 * `BRIEF.md`, which the storyboard and the review read, is generated from it.
 */
export const briefDocSchema = z.object({
  title: z.string().min(1).max(80),
  objective: z.string().min(1).max(300),
  audience: z.string().min(1).max(300),
  keyMessage: z.string().min(1).max(200),
  /** Facts, figures, steps or offers from the brief, word for word: the storyboard draws only from them. */
  points: z.array(z.string().min(1).max(240)).max(10),
  callToAction: z.string().max(160),
  tone: z.string().min(1).max(160),
  /** Videos only: whether a voice reads the script, and the music asked for (English description) or null. */
  audio: z.object({ voice: z.boolean(), music: z.string().max(200).nullable() }),
  /** What the brief did not say and was chosen. */
  assumptions: z.array(z.string().min(1).max(240)).max(8),
});
export type BriefDoc = z.infer<typeof briefDocSchema>;

/** A model's JSON answer, fences tolerated, checked by `schema`: the value, or the errors to send back to the model. */
export function parseJsonAnswer<T>(text: string, schema: z.ZodType<T>): { value: T | null; errors: string[] } {
  const raw = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    return { value: null, errors: [`Réponse qui n'est pas du JSON valide : ${error instanceof Error ? error.message : String(error)}`] };
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) return { value: null, errors: parsed.error.issues.map((issue) => `${issue.path.join(".") || "racine"} : ${issue.message}`) };
  return { value: parsed.data, errors: [] };
}

/** A JSON schema for `response_format`, without the `$schema` key some providers refuse. */
function jsonSchemaOf(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { io: "input" }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

export function briefDocJsonSchema(): Record<string, unknown> {
  return jsonSchemaOf(briefDocSchema);
}

/** Format line of the brief: what the création is, as the storyboard prompt needs it. */
export type BriefFormat = { type: "video" | "carousel" | "image" | "realistic"; width: number; height: number; durationSeconds?: number | null; frames?: number | null };

export function briefFormatLine({ type, width, height, durationSeconds, frames }: BriefFormat): string {
  const size = `${width}×${height}`;
  if (type === "image") return `image fixe ${size}`;
  if (type === "carousel") return `carrousel de ${frames ?? "?"} slides ${size}`;
  if (type === "realistic") return `vidéo réaliste ${size}${durationSeconds ? `, ${durationSeconds} s` : ""}, plans générés par des modèles vidéo`;
  return `vidéo ${size}${durationSeconds ? `, ${durationSeconds} s` : ""}`;
}

const list = (items: readonly string[]) => (items.length ? items.map((item) => `- ${item}`).join("\n") : "(aucun)");

export function renderBriefMd(doc: BriefDoc, format: BriefFormat): string {
  const video = format.type === "video" || format.type === "realistic";
  return [
    "---",
    "engine: blocks",
    `format: ${JSON.stringify(briefFormatLine(format))}`,
    ...(video ? [`voice: ${doc.audio.voice}`, `music: ${JSON.stringify(doc.audio.music)}`] : []),
    "---",
    "",
    `# ${doc.title}`,
    "",
    `**Objectif :** ${doc.objective}`,
    "",
    `**Public :** ${doc.audience}`,
    "",
    `**Message clé :** ${doc.keyMessage}`,
    "",
    `**Ton :** ${doc.tone}`,
    "",
    `**Format :** ${briefFormatLine(format)}`,
    "",
    "## Contenu",
    "",
    list(doc.points),
    "",
    `**Appel à l'action :** ${doc.callToAction || "(aucun)"}`,
    ...(video
      ? ["", "## Son", "", `- Voix off : ${doc.audio.voice ? "oui" : "non"}`, `- Musique : ${doc.audio.music ?? "aucune"}`]
      : []),
    "",
    "## Hypothèses",
    "",
    list(doc.assumptions),
    "",
  ].join("\n");
}

/**
 * The answer of the variables step on the blocks engine: a template's contract, texts and image paths only (the
 * blocks show nothing else), validated like `VARIABLES.json`.
 */
const blocksVariableSchema = z.object({
  id: z.string().regex(VARIABLE_ID, "lettres, chiffres et _ uniquement, en commençant par une minuscule"),
  type: z.literal("string"),
  label: z.string().min(1).max(80),
  default: z.string().max(300),
  maxLength: z.number().int().positive().max(300).optional(),
});
export const blocksVariablesAnswerSchema = z.object({
  variables: z
    .array(blocksVariableSchema)
    .min(1)
    .max(10)
    .superRefine((variables, ctx) => {
      const result = compositionVariablesSchema.safeParse(variables);
      if (!result.success) for (const issue of result.error.issues) ctx.addIssue({ code: "custom", path: issue.path, message: issue.message });
      variables.forEach((variable, index) => {
        if (variable.maxLength && variable.default.length > variable.maxLength)
          ctx.addIssue({ code: "custom", path: [index, "default"], message: `${variable.id} : la valeur par défaut dépasse maxLength (${variable.maxLength})` });
      });
    }),
});

export function blocksVariablesJsonSchema(): Record<string, unknown> {
  return jsonSchemaOf(blocksVariablesAnswerSchema);
}
