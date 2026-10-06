import type { GenerationStep, JobStatus } from "@studio/shared/browser";

export const STEP_LABELS: Record<GenerationStep, string> = {
  brief: "Brief",
  storyboard: "Storyboard",
  media: "Voix et musique",
  build: "Build",
};

export const STATUS_LABELS: Record<JobStatus, string> = {
  queued: "En file",
  running: "En cours",
  waiting_review: "À valider",
  succeeded: "Terminé",
  failed: "Échec",
  cancelled: "Annulé",
};

export const WORKFLOWS = [
  { value: "product-launch-video", label: "Promo produit / site" },
  { value: "faceless-explainer", label: "Explainer (texte)" },
  { value: "motion-graphics", label: "Motion graphic court" },
  { value: "music-to-video", label: "Vidéo sur musique" },
  { value: "general-video", label: "Vidéo libre" },
] as const;
