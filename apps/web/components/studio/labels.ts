import { aspectOf, type Aspect, type CreationType, type GenerationStep, type JobStatus } from "@studio/shared/browser";
import {
  AudioLinesIcon,
  BoxIcon,
  CaptionsIcon,
  DownloadIcon,
  FileTextIcon,
  FilmIcon,
  GalleryHorizontalIcon,
  ImageIcon,
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
import type { PipelineStep } from "@/lib/creation-state";

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

type StepMeta = { label: string; icon: LucideIcon; doing: string; hint: string };

/** What changes in the pipeline for a still: a carousel plans slides, an image is composed straight from its brief. */
const STILL_STEPS: Record<Exclude<CreationType, "video">, Partial<Record<PipelineStep, Partial<StepMeta>>>> = {
  carousel: {
    brief: { hint: "Claude reformule ta demande dans BRIEF.md : objectif, message de chaque slide, appel à l'action." },
    storyboard: {
      label: "Plan des slides",
      doing: "Claude prépare le plan des slides",
      hint: "Une slide par idée : titre, texte exact et visuel. Tu valides le plan avant la mise en page.",
    },
    build: { doing: "Claude met en page le carrousel", hint: "Les slides sont composées et vérifiées. Tu les valides sur leurs captures." },
    export: { hint: "Une image par slide et un PDF prêt pour LinkedIn, générés après validation du build." },
  },
  image: {
    brief: { hint: "Claude reformule ta demande dans BRIEF.md : accroche, hiérarchie des textes, visuel attendu." },
    build: { doing: "Claude compose l'image", hint: "Le visuel est composé et vérifié. Tu le valides sur sa capture." },
    export: { hint: "Le PNG part automatiquement après validation du build." },
  },
};

export function stepMeta(step: PipelineStep, type: CreationType = "video"): StepMeta {
  return { ...PIPELINE[step], ...(type === "video" ? {} : STILL_STEPS[type][step]) };
}

export const CREATION_TYPE_META: Record<CreationType, { label: string; plural: string; noun: string; icon: LucideIcon; description: string }> = {
  video: {
    label: "Vidéo",
    plural: "Vidéos",
    noun: "la vidéo",
    icon: FilmIcon,
    description: "Promo, explainer, motion design, sous-titres : un MP4 avec voix et musique si besoin.",
  },
  carousel: {
    label: "Carrousel",
    plural: "Carrousels",
    noun: "le carrousel",
    icon: GalleryHorizontalIcon,
    description: "Une suite de slides pour LinkedIn ou Instagram : une image par slide et un PDF.",
  },
  image: {
    label: "Image",
    plural: "Images",
    noun: "l'image",
    icon: ImageIcon,
    description: "Un visuel fixe : post, bannière, affiche. Un PNG prêt à publier.",
  },
};

export const ASPECT_META: Record<Aspect, { label: string; box: string }> = {
  "9:16": { label: "Vertical · Stories, Reels", box: "h-6 w-3.5" },
  "4:5": { label: "Portrait · fil LinkedIn, Instagram", box: "h-6 w-5" },
  "1:1": { label: "Carré", box: "size-5" },
  "16:9": { label: "Paysage · YouTube, site", box: "h-3.5 w-6" },
};

/** "Carrousel · 4:5 · 6 slides", "Vidéo · 9:16 · 30 s", "Vidéo · cadre de la source". */
export function formatSummary(creation: { type: CreationType; width: number | null; height: number | null; durationSeconds: number | null; slideCount: number | null }) {
  const aspect = aspectOf(creation.width, creation.height);
  const canvas = aspect ?? (creation.width && creation.height ? `${creation.width}×${creation.height}` : "cadre de la source");
  const parts: string[] = [CREATION_TYPE_META[creation.type].label, canvas];
  if (creation.type === "video" && creation.durationSeconds) parts.push(`${creation.durationSeconds} s`);
  if (creation.type === "carousel" && creation.slideCount) parts.push(`${creation.slideCount} slides`);
  return parts.join(" · ");
}

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
