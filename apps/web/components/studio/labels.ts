import type { GenerationStep, JobStatus } from "@studio/shared/browser";
import {
  AudioLinesIcon,
  BoxIcon,
  CaptionsIcon,
  DownloadIcon,
  FileTextIcon,
  FilmIcon,
  LayersIcon,
  type LucideIcon,
  MonitorPlayIcon,
  MusicIcon,
  PresentationIcon,
  RocketIcon,
  SparklesIcon,
  SquareUserIcon,
  VariableIcon,
  WandSparklesIcon,
} from "lucide-react";
import type { PipelineStep } from "@/lib/project-state";

export const STEP_LABELS: Record<GenerationStep, string> = {
  brief: "Brief",
  variables: "Variables",
  storyboard: "Storyboard",
  media: "Voix et musique",
  build: "Build",
};

/** The stops of the pipeline as the stepper shows them, with what happens at each. */
export const PIPELINE: Record<PipelineStep, { label: string; icon: LucideIcon; doing: string; hint: string }> = {
  brief: {
    label: "Brief",
    icon: FileTextIcon,
    doing: "Claude rédige le brief",
    hint: "Claude reformule ta demande dans BRIEF.md, puis enchaîne sur le storyboard.",
  },
  variables: {
    label: "Variables",
    icon: VariableIcon,
    doing: "Claude propose les variables",
    hint: "Ce qui changera d'une version à l'autre : textes, couleurs, images. Tu corriges la liste et tu la valides avant le storyboard.",
  },
  storyboard: {
    label: "Storyboard",
    icon: PresentationIcon,
    doing: "Claude construit le storyboard",
    hint: "Découpage en frames, texte à l'écran et intentions visuelles. Tu le valides avant la suite.",
  },
  media: {
    label: "Voix et musique",
    icon: AudioLinesIcon,
    doing: "Claude produit la voix off et la musique",
    hint: "Voix off par frame et fond musical calé sur la voix. Étape sautée pour une vidéo muette.",
  },
  build: {
    label: "Build",
    icon: BoxIcon,
    doing: "Claude compose la vidéo",
    hint: "La composition HyperFrames est écrite et vérifiée. Tu la valides sur ses captures.",
  },
  export: {
    label: "Export",
    icon: DownloadIcon,
    doing: "Rendu en cours",
    hint: "Le MP4 part automatiquement après validation du build ; d'autres formats à la demande.",
  },
  iterations: {
    label: "Itérations",
    icon: LayersIcon,
    doing: "Rendu en cours",
    hint: "Chaque itération est un jeu de valeurs avec ses rendus. Tu la modifies et tu relances le rendu, sans Claude.",
  },
};

export const STATUS_LABELS: Record<JobStatus, string> = {
  queued: "En file",
  running: "En cours",
  waiting_review: "À valider",
  succeeded: "Terminé",
  failed: "Échec",
  cancelled: "Annulé",
};

/** What the user starts from: it narrows the workflows and decides which files are required. */
export type StartPoint = "idea" | "site" | "footage" | "music";

export const WORKFLOWS = [
  {
    value: "product-launch-video",
    start: "site",
    label: "Promo produit / site",
    description: "À partir d'une URL ou d'un brief : lancement, démo, visite d'un site.",
    icon: RocketIcon,
  },
  {
    value: "faceless-explainer",
    start: "idea",
    label: "Explainer",
    description: "Un sujet, un article ou des notes expliqués en 60-90 s, visuels inventés.",
    icon: MonitorPlayIcon,
  },
  {
    value: "motion-graphics",
    start: "idea",
    label: "Motion graphic court",
    description: "Moins de 10 s, sans voix : titre animé, chiffre clé, logo, lower-third.",
    icon: SparklesIcon,
  },
  {
    value: "music-to-video",
    start: "music",
    label: "Vidéo sur musique",
    description: "Le morceau dicte le rythme : clip lyrics, slideshow ou promo cadencée.",
    icon: MusicIcon,
  },
  {
    value: "general-video",
    start: "idea",
    label: "Vidéo libre",
    description: "Tout le reste : montage multi-scènes, sizzle, carton titre, boucle.",
    icon: WandSparklesIcon,
  },
  {
    value: "embedded-captions",
    start: "footage",
    label: "Sous-titres incrustés",
    description: "Ta vidéo telle quelle, avec des sous-titres dessinés et synchronisés à la parole.",
    icon: CaptionsIcon,
  },
  {
    value: "talking-head-recut",
    start: "footage",
    label: "Habillage interview",
    description: "Interview, podcast ou face caméra habillé : titres animés, chiffres, citations, bandeaux.",
    icon: SquareUserIcon,
  },
] as const satisfies readonly { value: string; start: StartPoint; label: string; description: string; icon: LucideIcon }[];

export function workflowMeta(value: string): { label: string; icon: LucideIcon } {
  return WORKFLOWS.find((workflow) => workflow.value === value) ?? { label: value, icon: FilmIcon };
}
