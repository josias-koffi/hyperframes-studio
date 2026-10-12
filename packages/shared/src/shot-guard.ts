import { z } from "zod";

/**
 * The guardrail of a realistic création: before fal generates a shot, a model reads its prompt and refuses one that
 * shows a real, recognisable person or a brand the campaign has no rights to. The campaign's own brand is allowed.
 */
export const SHOT_GUARD_VERDICTS = ["ok", "real_person", "brand"] as const;
export type ShotGuardVerdict = (typeof SHOT_GUARD_VERDICTS)[number];

export const shotGuardSchema = z.object({
  shots: z
    .array(
      z.object({
        id: z.string().regex(/^s[0-9]{1,2}$/),
        verdict: z.enum(SHOT_GUARD_VERDICTS),
        /** Why it is refused, in one short sentence; empty when it is ok. */
        reason: z.string().max(300),
      }),
    )
    .max(20),
});
export type ShotGuardAnswer = z.infer<typeof shotGuardSchema>;

export function shotGuardJsonSchema(): Record<string, unknown> {
  const json = z.toJSONSchema(shotGuardSchema, { io: "input" }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

/** A shot the guardrail refused, as `shots_guard.json` keeps it for the review. */
export type RefusedShot = { id: string; verdict: Exclude<ShotGuardVerdict, "ok">; reason: string };
