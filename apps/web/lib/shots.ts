import { REALISTIC_BUDGET_EUR, USD_PER_EUR, type RefusedShot, type ShotPass } from "@studio/shared/browser";

/** What `scripts/shots.mjs` records of one generation (`shots_meta.json`). */
type Generation = { model?: string; pass?: ShotPass; seconds?: number; costUsd?: number; status?: "ok" | "failed"; error?: string; at?: string };
type Cost = { usd: number; priced: boolean } | null;

/** A generated shot of a realistic création, as its keyframes and shots reviews show it. */
export type ShotView = {
  id: string;
  title: string;
  duration: number;
  prompt: string;
  camera: string;
  audio: boolean;
  keyframe: Generation | null;
  shot: Generation | null;
  /** What generating it again would cost (USD): its keyframe, its draft, its final pass. */
  estimate: { keyframe: Cost; draft: Cost; final: Cost };
};

/** A run the budget stopped (`shots_budget.json`), waiting for the user's confirmation. */
export type BudgetBlock = { step: "keyframes" | "shots"; only: string[]; pass: ShotPass; estimateUsd: number; spentUsd: number; budgetUsd: number; unpriced: string[] };

/** Shots the guardrail refused in the last run of a step (`shots_guard.json`): a real person, a brand without rights. */
export type GuardBlock = { step: "keyframes" | "shots"; shots: RefusedShot[] };

export type ShotsData = { shots: ShotView[]; spentUsd: number; budgetUsd: number; blocked: BudgetBlock | null; refused: GuardBlock | null };

function json<T>(text: string | null): T | null {
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** The shots of STORYBOARD.json with what shots_meta.json says of them; null before the storyboard exists. */
export function parseShots(storyboardText: string | null, metaText: string | null, budgetText: string | null, guardText: string | null = null): ShotsData | null {
  const storyboard = json<{ scenes: { id: string; title: string; duration: number; shot?: { prompt: string; camera?: string; audio?: boolean } | null }[] }>(storyboardText);
  if (!storyboard) return null;
  const meta = json<{
    spentUsd?: number;
    budgetUsd?: number;
    scenes?: Record<string, { keyframe?: Generation; shot?: Generation }>;
    estimate?: Record<string, { keyframe: Cost; draft: Cost; final: Cost }>;
  }>(metaText);
  const shots = storyboard.scenes
    .filter((scene) => scene.shot)
    .map((scene) => ({
      id: scene.id,
      title: scene.title,
      duration: scene.duration,
      prompt: scene.shot!.prompt,
      camera: scene.shot!.camera ?? "",
      audio: Boolean(scene.shot!.audio),
      keyframe: meta?.scenes?.[scene.id]?.keyframe ?? null,
      shot: meta?.scenes?.[scene.id]?.shot ?? null,
      estimate: meta?.estimate?.[scene.id] ?? { keyframe: null, draft: null, final: null },
    }));
  return {
    shots,
    spentUsd: meta?.spentUsd ?? 0,
    budgetUsd: meta?.budgetUsd ?? REALISTIC_BUDGET_EUR * USD_PER_EUR,
    blocked: json<BudgetBlock>(budgetText),
    refused: json<{ refused?: GuardBlock | null }>(guardText)?.refused ?? null,
  };
}

/** What generating these shots would cost, and whether a model has no price (the budget cannot be checked). */
export function estimateOf(shots: readonly ShotView[], key: "keyframe" | "draft" | "final"): { usd: number; unpriced: boolean } {
  return shots.reduce<{ usd: number; unpriced: boolean }>(
    (total, shot) => ({ usd: total.usd + (shot.estimate[key]?.usd ?? 0), unpriced: total.unpriced || !shot.estimate[key]?.priced }),
    { usd: 0, unpriced: false },
  );
}

/** Three decimals under ten cents: a keyframe costs a few tenths of a cent. */
export const usd = (value: number) => `${value.toFixed(value > 0 && value < 0.1 ? 3 : 2)} $`;
