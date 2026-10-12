import { mediaPriceOf, type AiModelKind, type ModelCapability, type ModelSlot } from "@studio/shared/browser";
import type { AiModel } from "@/lib/api";

/** Every slot a model is chosen for, in pipeline order, with what the model does there. */
export const MODEL_SLOT_META: Record<ModelSlot, { label: string; hint: string }> = {
  brief: { label: "Brief", hint: "Reformule la demande dans BRIEF.md." },
  footage: { label: "Analyse des rushs", hint: "Lit la vidéo fournie et repère les plans." },
  variables: { label: "Variables", hint: "Propose les variables d'un template." },
  storyboard: { label: "Storyboard", hint: "Écrit le script et découpe la vidéo en frames." },
  media: { label: "Voix et musique", hint: "Lance la voix off et la musique." },
  build: { label: "Build", hint: "Construit les compositions. Le plus exigeant." },
  edit: { label: "Édition", hint: "Les changements demandés depuis l'éditeur." },
  visual: { label: "Contrôle visuel", hint: "Relit la planche du build et corrige les textes ou les couleurs. Lit les images." },
  escalation: { label: "Escalade", hint: "Reprend une étape après deux échecs. Un modèle plus fort que les autres." },
};

export const CAPABILITY_META: Record<ModelCapability, { label: string; hint: string }> = {
  vision: { label: "Vision", hint: "Lit les images : analyse des rushs, contrôle visuel." },
  tools: { label: "Outils", hint: "Appelle des outils : peut travailler en agent." },
  structured: { label: "JSON", hint: "Répond dans un schéma JSON imposé." },
  zdr: { label: "Rétention zéro", hint: "Un fournisseur sur OpenRouter ne garde aucun prompt : le studio l'impose pour ce modèle." },
};

export const MODEL_KIND_META: Record<AiModelKind, { label: string; plural: string }> = {
  agent: { label: "Génération", plural: "Modèles de génération" },
  tts: { label: "Voix off", plural: "Voix de synthèse" },
  music: { label: "Musique", plural: "Modèles de musique" },
  image: { label: "Image (fal)", plural: "Modèles d'image (fal)" },
  video: { label: "Vidéo (fal)", plural: "Modèles vidéo (fal)" },
};

/** A fal model's catalog price: "0.06 $/s (0.4 $/s avec son)", "0.003 $/image", or null when none is set. */
export function mediaPriceLabel(model: Pick<AiModel, "kind" | "pricing">): string | null {
  const price = mediaPriceOf(model.kind, model.pricing);
  if (!price) return null;
  if (price.unit === "image") return `${price.usd} $/image`;
  return `${price.usd} $/s${price.usdWithAudio !== undefined ? ` (${price.usdWithAudio} $/s avec son)` : ""}`;
}

/** USD per token → "$x / M" for the price of a million tokens; null when OpenRouter gave none. */
export function pricePerMillion(value: string | undefined): string | null {
  const perToken = Number(value);
  if (value === undefined || !Number.isFinite(perToken)) return null;
  const perMillion = perToken * 1_000_000;
  return `$${perMillion < 10 ? perMillion.toFixed(2) : perMillion.toFixed(0)}`;
}

/** "$3 → $15 / M tokens", the input then output price, or null for a model without token prices. */
export function tokenPrice(model: Pick<AiModel, "pricing">): string | null {
  const input = pricePerMillion(model.pricing.prompt);
  const output = pricePerMillion(model.pricing.completion);
  if (!input || !output) return null;
  return `${input} → ${output} / M tokens`;
}

export function formatUsd(value: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "USD", maximumFractionDigits: value < 1 ? 3 : 2 }).format(value);
}
