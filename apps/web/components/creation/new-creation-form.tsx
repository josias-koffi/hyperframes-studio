"use client";

import {
  ASPECTS,
  ASPECTS_BY_TYPE,
  CREATION_TYPES,
  SLIDE_COUNT,
  slugify,
  type Aspect,
  type CreationKind,
  type CreationType,
} from "@studio/shared/browser";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BlocksIcon,
  BotIcon,
  CheckIcon,
  FileVideoIcon,
  FolderKanbanIcon,
  FolderPlusIcon,
  GlobeIcon,
  LayersIcon,
  LightbulbIcon,
  type LucideIcon,
  MinusIcon,
  MusicIcon,
  PlusIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ASPECT_META, CREATION_TYPE_META, WORKFLOWS, type StartPoint } from "@/components/studio/labels";
import { Button } from "@/components/ui/button";
import { FileDropzone, FileThumb } from "@/components/creation/file-dropzone";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { clientApi, type Creation, type Project } from "@/lib/api";
import { uploadAsset } from "@/lib/assets";
import { creationHref } from "@/lib/creation-state";
import { cn } from "@/lib/utils";

const STARTS: { value: StartPoint; label: string; description: string; icon: LucideIcon }[] = [
  { value: "idea", label: "Une idée ou un texte", description: "Un sujet, des notes, un article : les visuels sont inventés.", icon: LightbulbIcon },
  { value: "site", label: "Un site ou un produit", description: "Une URL dont Claude capture les visuels pour une promo.", icon: GlobeIcon },
  { value: "footage", label: "Une vidéo existante", description: "Un rush, une interview, un face caméra à habiller ou sous-titrer.", icon: FileVideoIcon },
  { value: "music", label: "Une musique", description: "Un morceau qui donne le rythme à la vidéo.", icon: MusicIcon },
];

/** The file a start point cannot do without. */
const REQUIRED_FILE: Partial<Record<StartPoint, { accept: string; label: string }>> = {
  footage: { accept: "video/*", label: "Ta vidéo" },
  music: { accept: "audio/*", label: "Ton morceau" },
};

const DURATIONS = [15, 30, 60, 90];

const KINDS: { value: CreationKind; label: string; description: string; icon: LucideIcon }[] = [
  { value: "oneshot", label: "Création unique", description: "Faite une fois : du brief jusqu'à l'export.", icon: SparklesIcon },
  {
    value: "template",
    label: "Template réutilisable",
    description: "À décliner : tu valides ses variables (textes, couleurs, images), puis tu génères des versions sans Claude.",
    icon: LayersIcon,
  },
];

type Engine = "agent" | "blocks";

/** How the video is made after the brief; the blocks engine only covers a one-shot video from an idea for now. */
const ENGINES: { value: Engine; label: string; description: string; icon: LucideIcon }[] = [
  {
    value: "agent",
    label: "Sur mesure",
    description: "L'agent écrit chaque scène en code. Le plus libre, mais il demande un modèle fort (Claude).",
    icon: BotIcon,
  },
  {
    value: "blocks",
    label: "Blocs prêts à l'emploi",
    description: "Le modèle choisit des blocs validés et remplit leurs textes. Rapide, fiable, et un modèle bon marché suffit.",
    icon: BlocksIcon,
  },
];

/** What the user can already say about a variable; Claude turns it into a HyperFrames declaration. */
type SuggestedVariable = { label: string; type: string; example: string };

const SUGGESTION_TYPES = [
  { value: "texte", label: "Texte" },
  { value: "couleur", label: "Couleur" },
  { value: "image", label: "Image ou logo" },
  { value: "nombre", label: "Nombre" },
  { value: "choix", label: "Choix dans une liste" },
  { value: "oui/non", label: "Oui / non" },
];

type Step = "project" | "nature" | "start" | "workflow" | "content" | "settings" | "variables" | "recap";
const TITLES: Record<Step, string> = {
  project: "Projet",
  nature: "Type",
  start: "Point de départ",
  workflow: "Style de vidéo",
  content: "Contenu",
  settings: "Réglages",
  variables: "Variables",
  recap: "Récapitulatif",
};

/** Placeholders that speak about the format being made. */
const MESSAGE_PLACEHOLDER: Record<CreationType, string> = {
  video: "Ex. : Notre appli divise par deux le temps de saisie des notes de frais.",
  carousel: "Ex. : 5 erreurs qui font exploser vos notes de frais, et comment les éviter.",
  image: "Ex. : -30 % sur l'offre Pro jusqu'au 31 octobre.",
};

function ChoiceCard({
  selected,
  onClick,
  icon: Icon,
  label,
  description,
}: {
  selected: boolean;
  onClick: () => void;
  icon: LucideIcon;
  label: string;
  description: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        "relative flex flex-col gap-3 rounded-xl border bg-card p-5 text-left transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-surface focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        selected && "border-primary bg-accent shadow-surface ring-1 ring-primary",
      )}
    >
      <span className={cn("flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground", selected && "bg-primary text-primary-foreground")}>
        <Icon className="size-5" />
      </span>
      <span className="font-medium">{label}</span>
      <span className="text-sm text-muted-foreground">{description}</span>
      {selected && <CheckIcon className="absolute top-4 right-4 size-4 text-primary" />}
    </button>
  );
}

function StepHeading({ title, description }: { title: string; description: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

/** The steps across the top: done ones are ticked and reopen on click, the label of the others hides on small screens. */
function Stepper({ steps, index, onPick }: { steps: Step[]; index: number; onPick: (index: number) => void }) {
  return (
    <nav aria-label="Étapes" className="rounded-xl border bg-card px-4 py-3 shadow-surface">
      <ol className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none]">
        {steps.map((s, i) => (
          <li key={s} className={cn("flex items-center gap-2", i > 0 && "flex-1")}>
            {i > 0 && <span className={cn("h-0.5 min-w-4 flex-1 rounded-full transition-colors", i <= index ? "bg-primary" : "bg-border")} />}
            <button
              type="button"
              disabled={i >= index}
              onClick={() => onPick(i)}
              aria-current={i === index ? "step" : undefined}
              className="group flex shrink-0 items-center gap-2 rounded-full py-1 pr-2 text-sm transition-colors enabled:hover:text-primary disabled:cursor-default"
            >
              <span
                className={cn(
                  "flex size-7 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors",
                  i < index && "border-success bg-success text-white dark:text-background",
                  i === index && "border-primary bg-primary text-primary-foreground shadow-surface",
                  i > index && "border-border text-muted-foreground",
                )}
              >
                {i < index ? <CheckIcon className="size-3.5" strokeWidth={3} /> : i + 1}
              </span>
              <span className={cn("whitespace-nowrap", i === index ? "font-medium" : "hidden text-muted-foreground md:inline", i < index && "group-enabled:group-hover:text-primary")}>
                {TITLES[s]}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** One line of the summary: a dash while the answer is still to come. */
function SummaryRow({ label, children }: { label: string; children?: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );
}

/**
 * What is being made, filled in as the user answers: the frame with the first visual in it, the choices, the files.
 */
function CreationSummary({
  type,
  kind,
  projectLabel,
  isNewProject,
  name,
  workflowLabel,
  engineLabel,
  format,
  frame,
  cover,
  files,
  variables,
}: {
  type: CreationType;
  kind: CreationKind;
  projectLabel?: string;
  isNewProject: boolean;
  name: string;
  workflowLabel?: string;
  engineLabel?: string;
  format: string;
  /** Width / height of the output, null when it is the source video's. */
  frame: number | null;
  cover?: File;
  files: File[];
  variables?: string[];
}) {
  const meta = CREATION_TYPE_META[type];
  return (
    <Card className="gap-0 py-0 shadow-surface xl:sticky xl:top-0">
      <div className="flex items-center justify-center bg-muted/60 p-6 [background-image:radial-gradient(var(--border)_1px,transparent_1px)] [background-size:12px_12px]">
        <div
          className="relative flex max-h-56 w-full max-w-56 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-primary/25 via-primary/10 to-card shadow-surface ring-1 ring-foreground/10 transition-[aspect-ratio] duration-300"
          style={{ aspectRatio: frame ?? 16 / 9, width: frame !== null && frame < 1 ? `${frame * 14}rem` : undefined }}
        >
          {cover ? <FileThumb file={cover} className="absolute inset-0" /> : <meta.icon className="size-8 text-primary/70" />}
        </div>
      </div>
      <div className="space-y-4 border-t p-5">
        <div className="space-y-0.5">
          <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-primary uppercase">
            <meta.icon className="size-3.5" />
            {meta.label} · {kind === "template" ? "template" : "unique"}
          </p>
          <p className={cn("truncate text-base font-semibold", !name && "text-muted-foreground")}>{name || "Sans nom"}</p>
          {name && <p className="truncate font-mono text-xs text-muted-foreground">videos/{slugify(name)}</p>}
        </div>
        <dl className="space-y-2 text-sm">
          <SummaryRow label="Projet">
            {projectLabel}
            {isNewProject && projectLabel && <span className="text-muted-foreground"> (nouveau)</span>}
          </SummaryRow>
          {type === "video" && <SummaryRow label="Style">{workflowLabel}</SummaryRow>}
          {engineLabel && <SummaryRow label="Fabrication">{engineLabel}</SummaryRow>}
          <SummaryRow label="Format">{format}</SummaryRow>
          {variables && <SummaryRow label="Variables">{variables.join(", ")}</SummaryRow>}
        </dl>
        {files.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {files.length} fichier{files.length > 1 ? "s" : ""} à envoyer
            </p>
            <ul className="grid grid-cols-5 gap-1.5">
              {files.map((file, i) => (
                <li key={`${file.name}-${i}`} title={file.name} className="aspect-square overflow-hidden rounded-md ring-1 ring-foreground/10">
                  <FileThumb file={file} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}

/**
 * A guided creation, one question per screen. The type decides the réglages: a video has a start point, a
 * workflow, a frame and a length; a carousel a frame and a number of slides; an image a frame.
 */
export function NewCreationForm({
  projects,
  initialProjectId,
  initialType,
  initialKind = "oneshot",
}: {
  projects: Pick<Project, "id" | "name">[];
  initialProjectId?: string;
  initialType?: CreationType;
  initialKind?: CreationKind;
}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [projectId, setProjectId] = useState<string | "new">(initialProjectId ?? (projects[0]?.id || "new"));
  const [projectName, setProjectName] = useState("");
  const [projectContext, setProjectContext] = useState("");
  const [type, setType] = useState<CreationType>(initialType ?? "video");
  const [kind, setKind] = useState<CreationKind>(initialKind);
  const [suggestions, setSuggestions] = useState<SuggestedVariable[]>([]);
  const [start, setStart] = useState<StartPoint>("idea");
  const [workflow, setWorkflow] = useState<string | null>(null);
  const [engine, setEngine] = useState<Engine>("agent");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [audience, setAudience] = useState("");
  const [notes, setNotes] = useState("");
  const [mainFile, setMainFile] = useState<File[]>([]);
  const [backgrounds, setBackgrounds] = useState<File[]>([]);
  const [extras, setExtras] = useState<File[]>([]);
  const [aspect, setAspect] = useState<Aspect>(ASPECTS_BY_TYPE[initialType ?? "video"][0]);
  const [duration, setDuration] = useState(30);
  const [slides, setSlides] = useState<number>(SLIDE_COUNT.default);
  const [progress, setProgress] = useState<string | null>(null);

  const video = type === "video";
  // A source video keeps its own frame and length: no réglages. Only a video has a start point and a workflow.
  const steps: Step[] = [
    ...(initialProjectId ? [] : (["project"] as const)),
    "nature",
    ...(video ? (["start", "workflow"] as const) : []),
    "content",
    ...(video && start === "footage" ? [] : (["settings"] as const)),
    ...(kind === "template" ? (["variables"] as const) : []),
    "recap",
  ];
  const step = steps[Math.min(index, steps.length - 1)];
  const filledSuggestions = suggestions.filter((suggestion) => suggestion.label.trim() !== "");
  const required = video ? REQUIRED_FILE[start] : undefined;
  const choices = WORKFLOWS.filter((w) => w.start === start);
  const chosen = choices.find((w) => w.value === workflow);
  const blocksAvailable = video && start === "idea" && kind === "oneshot";
  const projectLabel = projectId === "new" ? projectName : projects.find((p) => p.id === projectId)?.name;

  const ready: Record<Step, boolean> = {
    project: projectId !== "new" || projectName.trim() !== "",
    nature: true,
    start: true,
    workflow: workflow !== null,
    content: name.trim() !== "" && (start === "footage" || message.trim() !== "") && (!required || mainFile.length === 1),
    settings: true,
    variables: true,
    recap: true,
  };

  function updateSuggestion(index: number, patch: Partial<SuggestedVariable>) {
    setSuggestions((current) => current.map((suggestion, i) => (i === index ? { ...suggestion, ...patch } : suggestion)));
  }

  function pickType(value: CreationType) {
    setType(value);
    if (value === "video") setBackgrounds([]);
    if (!ASPECTS_BY_TYPE[value].includes(aspect)) setAspect(ASPECTS_BY_TYPE[value][0]);
  }

  function pickStart(value: StartPoint) {
    setStart(value);
    const options = WORKFLOWS.filter((w) => w.start === value);
    // One workflow for this start: preselect it, the user only confirms.
    setWorkflow(options.length === 1 ? options[0].value : null);
    setMainFile([]);
  }

  async function create() {
    setProgress("Création…");
    try {
      let targetProject = projectId;
      if (targetProject === "new") {
        setProgress("Création du projet…");
        const project = await clientApi<Project>("/projects", {
          method: "POST",
          body: JSON.stringify({ name: projectName.trim(), context: projectContext.trim() }),
        });
        targetProject = project.id;
        setProjectId(project.id);
      }
      const brief: Record<string, unknown> = { message, audience, language: "fr", notes };
      if (kind === "template" && filledSuggestions.length > 0) brief.variables = filledSuggestions;
      if (blocksAvailable && engine === "blocks") brief.engine = "blocks";
      const footage = video && start === "footage";
      setProgress(`Création ${type === "image" ? "de l'image" : type === "carousel" ? "du carrousel" : "de la vidéo"}…`);
      const creation = await clientApi<Creation>(`/projects/${targetProject}/creations`, {
        method: "POST",
        body: JSON.stringify({
          name,
          type,
          kind,
          workflow: video ? workflow : undefined,
          aspect: footage ? undefined : aspect,
          durationSeconds: video && !footage ? duration : undefined,
          slideCount: type === "carousel" ? slides : undefined,
          brief,
        }),
      });
      const files = [...mainFile, ...backgrounds, ...extras];
      const named: Record<string, unknown> = {};
      const backgroundNames: string[] = [];
      for (const [i, file] of files.entries()) {
        setProgress(`Envoi de ${file.name} (${i + 1}/${files.length})…`);
        const asset = await uploadAsset(file, { creationId: creation.id });
        if (i === 0 && mainFile.length) named[start === "footage" ? "footage" : "music"] = asset.filename;
        else if (i < mainFile.length + backgrounds.length) backgroundNames.push(asset.filename);
      }
      if (backgroundNames.length) named.backgrounds = backgroundNames;
      // The stored name is sanitized by the API: the brief points at it, not at the local file name.
      if (Object.keys(named).length) {
        await clientApi(`/creations/${creation.id}`, { method: "PATCH", body: JSON.stringify({ brief: { ...brief, ...named } }) });
      }
      router.push(creationHref(creation));
    } catch (error) {
      toast.error((error as Error).message);
      setProgress(null);
    }
  }

  const footage = video && start === "footage";
  const noun = type === "image" ? "l'image" : type === "carousel" ? "le carrousel" : "la vidéo";
  const format = footage
    ? "Cadre et durée de la vidéo source"
    : [aspect, video && `${duration} s`, type === "carousel" && `${slides} slides`].filter(Boolean).join(" · ");
  const cover = footage ? mainFile[0] : backgrounds[0];

  return (
    <div className="flex flex-col gap-6 px-4 lg:px-6">
      <Stepper steps={steps} index={index} onPick={setIndex} />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card className="gap-0 py-0 shadow-surface">
          <CardContent key={step} className="rise-in space-y-6 p-6 md:p-8">
            {step === "project" && (
              <>
                <StepHeading title="Dans quel projet ?" description="Un projet regroupe les créations d'une campagne et leur donne un contexte commun." />
                <div role="radiogroup" className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                  {projects.map((project) => (
                    <ChoiceCard
                      key={project.id}
                      selected={projectId === project.id}
                      onClick={() => setProjectId(project.id)}
                      icon={FolderKanbanIcon}
                      label={project.name}
                      description="Projet existant"
                    />
                  ))}
                  <ChoiceCard
                    selected={projectId === "new"}
                    onClick={() => setProjectId("new")}
                    icon={FolderPlusIcon}
                    label="Nouveau projet"
                    description="Pour une nouvelle campagne."
                  />
                </div>
                {projectId === "new" && (
                  <FieldGroup className="max-w-2xl">
                    <Field>
                      <FieldLabel htmlFor="project-name">Nom du projet</FieldLabel>
                      <Input id="project-name" autoFocus value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Ex. : Lancement offre Pro — Q4" />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="project-context">Contexte de la campagne (facultatif)</FieldLabel>
                      <Textarea
                        id="project-context"
                        rows={3}
                        value={projectContext}
                        onChange={(e) => setProjectContext(e.target.value)}
                        placeholder="Offre, cible, ton, dates, mentions obligatoires…"
                      />
                      <FieldDescription>Repris dans le brief de chaque création du projet.</FieldDescription>
                    </Field>
                  </FieldGroup>
                )}
              </>
            )}

            {step === "nature" && (
              <>
                <StepHeading title="Que veux-tu créer ?" description="Le type décide des réglages et de ce que tu récupères à la fin." />
                <div role="radiogroup" className="grid gap-4 sm:grid-cols-3">
                  {CREATION_TYPES.map((t) => (
                    <ChoiceCard
                      key={t}
                      selected={type === t}
                      onClick={() => pickType(t)}
                      icon={CREATION_TYPE_META[t].icon}
                      label={CREATION_TYPE_META[t].label}
                      description={CREATION_TYPE_META[t].description}
                    />
                  ))}
                </div>
                <div className="border-t" />
                <StepHeading title="Unique ou template ?" description="Ce choix est définitif : un template se décline, une création unique s'exporte." />
                <div role="radiogroup" className="grid gap-4 sm:grid-cols-2">
                  {KINDS.map((k) => (
                    <ChoiceCard key={k.value} selected={kind === k.value} onClick={() => setKind(k.value)} icon={k.icon} label={k.label} description={k.description} />
                  ))}
                </div>
              </>
            )}

            {step === "start" && (
              <>
                <StepHeading title="De quoi pars-tu ?" description="Ça choisit la méthode que Claude va suivre et les fichiers dont il a besoin." />
                <div role="radiogroup" className="grid gap-4 sm:grid-cols-2">
                  {STARTS.map((s) => (
                    <ChoiceCard key={s.value} selected={start === s.value} onClick={() => pickStart(s.value)} icon={s.icon} label={s.label} description={s.description} />
                  ))}
                </div>
              </>
            )}

            {step === "workflow" && (
              <>
                <StepHeading
                  title="Quelle vidéo veux-tu ?"
                  description={choices.length === 1 ? "Un seul style correspond à ce point de départ : confirme-le." : "Choisis celui qui se rapproche le plus de ton idée."}
                />
                <div role="radiogroup" className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                  {choices.map((w) => (
                    <ChoiceCard key={w.value} selected={workflow === w.value} onClick={() => setWorkflow(w.value)} icon={w.icon} label={w.label} description={w.description} />
                  ))}
                </div>
                {blocksAvailable && (
                  <>
                    <StepHeading
                      title="Comment la fabriquer ?"
                      description="Après le brief, le storyboard et la composition peuvent être écrits par l'agent ou assemblés à partir de blocs."
                    />
                    <div role="radiogroup" className="grid gap-4 sm:grid-cols-2">
                      {ENGINES.map((option) => (
                        <ChoiceCard
                          key={option.value}
                          selected={engine === option.value}
                          onClick={() => setEngine(option.value)}
                          icon={option.icon}
                          label={option.label}
                          description={option.description}
                        />
                      ))}
                    </div>
                  </>
                )}
              </>
            )}

            {step === "content" && (
              <>
                <StepHeading
                  title={`Parle-nous de ${noun}`}
                  description="Ce que tu écris ici devient le brief que Claude rédige. Les fichiers sont envoyés à la création."
                />
                <div className="grid gap-8 lg:grid-cols-2">
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="name">Nom {type === "image" ? "de l'image" : type === "carousel" ? "du carrousel" : "de la vidéo"}</FieldLabel>
                      <Input id="name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. : Post LinkedIn — lancement" />
                      <FieldDescription>{name ? <span className="font-mono">videos/{slugify(name)}</span> : "Il sert aussi de nom de dossier."}</FieldDescription>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="message">{footage ? "Ce que tu veux en faire (facultatif)" : "Message clé"}</FieldLabel>
                      <Textarea
                        id="message"
                        rows={3}
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder={footage ? "Ex. : mettre en avant les trois chiffres clés, sous-titres jaunes" : MESSAGE_PLACEHOLDER[type]}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="audience">Audience</FieldLabel>
                      <Input id="audience" value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="Ex. : managers de PME, LinkedIn" />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="notes">{video && start === "site" ? "URL du site et contraintes" : "Notes et contraintes"}</FieldLabel>
                      <Textarea
                        id="notes"
                        rows={3}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder={type === "carousel" ? "Plan souhaité, appel à l'action final, charte…" : "Charte, ton, éléments obligatoires…"}
                      />
                      {video && start === "site" && <FieldDescription>Claude capture les visuels du site à partir de l&apos;URL.</FieldDescription>}
                    </Field>
                  </FieldGroup>
                  <FieldGroup>
                    {required && (
                      <FileDropzone
                        label={required.label}
                        accept={required.accept}
                        files={mainFile}
                        onChange={setMainFile}
                        hint={start === "footage" ? "MP4, MOV, WebM — jusqu'à 2 Go" : "MP3, WAV, M4A — jusqu'à 2 Go"}
                        description={
                          start === "footage"
                            ? "La vidéo est conservée telle quelle : son cadre et sa durée sont ceux de la vidéo finale."
                            : "Le morceau qui rythme la vidéo."
                        }
                      />
                    )}
                    {!video && (
                      <FileDropzone
                        label="Images de fond (facultatif)"
                        accept="image/*"
                        multiple
                        files={backgrounds}
                        onChange={setBackgrounds}
                        hint="JPG, PNG, WebP — plusieurs à la fois"
                        description={
                          type === "carousel"
                            ? "Photos ou visuels posés en fond ou dans les formes. Un seul fond sert à toutes les slides ; plusieurs sont répartis dans l'ordre."
                            : "Photos ou visuels posés en fond ou dans les formes."
                        }
                      />
                    )}
                    <FileDropzone
                      label="Fichiers propres à cette création (facultatif)"
                      multiple
                      files={extras}
                      onChange={setExtras}
                      hint="Images, vidéos, sons, documents"
                      description="Photos, visuels produit… Le logo et la charte vont plutôt dans les assets du projet, partagés par toutes ses créations."
                    />
                  </FieldGroup>
                </div>
              </>
            )}

            {step === "settings" && (
              <>
                <StepHeading title="Réglages" description="Le cadre de sortie et, selon le type, la durée ou le nombre de slides." />
                <FieldGroup className="sm:flex-row sm:flex-wrap sm:gap-10">
                  <Field className="w-auto">
                    <FieldLabel>Cadre</FieldLabel>
                    <ToggleGroup type="single" variant="outline" value={aspect} onValueChange={(v) => v && setAspect(v as Aspect)} className="bg-card">
                      {ASPECTS_BY_TYPE[type].map((a) => (
                        <ToggleGroupItem key={a} value={a} className="h-auto flex-col gap-1.5 px-4 py-2.5" aria-label={`${ASPECT_META[a].label} ${a}`}>
                          <span className={cn("rounded-[3px] border-2 border-current", ASPECT_META[a].box)} />
                          <span className="text-xs">{a}</span>
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                    <FieldDescription>
                      {ASPECT_META[aspect].label} · {ASPECTS[aspect].width}×{ASPECTS[aspect].height}
                    </FieldDescription>
                  </Field>
                  {video && (
                    <Field className="w-auto">
                      <FieldLabel>Durée</FieldLabel>
                      <ToggleGroup type="single" variant="outline" value={String(duration)} onValueChange={(v) => v && setDuration(Number(v))} className="bg-card">
                        {DURATIONS.map((d) => (
                          <ToggleGroupItem key={d} value={String(d)} className="px-4">
                            {d} s
                          </ToggleGroupItem>
                        ))}
                      </ToggleGroup>
                      <FieldDescription>Une cible : Claude ajuste au rythme du texte.</FieldDescription>
                    </Field>
                  )}
                  {type === "carousel" && (
                    <Field className="w-auto">
                      <FieldLabel htmlFor="slides">Nombre de slides</FieldLabel>
                      <div className="flex items-center gap-2">
                        <Button type="button" variant="outline" size="icon" onClick={() => setSlides((n) => Math.max(SLIDE_COUNT.min, n - 1))} disabled={slides <= SLIDE_COUNT.min}>
                          <MinusIcon />
                          <span className="sr-only">Une slide de moins</span>
                        </Button>
                        <Input
                          id="slides"
                          type="number"
                          min={SLIDE_COUNT.min}
                          max={SLIDE_COUNT.max}
                          value={slides}
                          onChange={(e) => setSlides(Math.min(SLIDE_COUNT.max, Math.max(SLIDE_COUNT.min, Number(e.target.value) || SLIDE_COUNT.min)))}
                          className="w-20 text-center tabular-nums"
                        />
                        <Button type="button" variant="outline" size="icon" onClick={() => setSlides((n) => Math.min(SLIDE_COUNT.max, n + 1))} disabled={slides >= SLIDE_COUNT.max}>
                          <PlusIcon />
                          <span className="sr-only">Une slide de plus</span>
                        </Button>
                      </div>
                      <FieldDescription>
                        Entre {SLIDE_COUNT.min} et {SLIDE_COUNT.max}. Accroche, une idée par slide, appel à l&apos;action à la fin.
                      </FieldDescription>
                    </Field>
                  )}
                </FieldGroup>
              </>
            )}

            {step === "variables" && (
              <>
                <StepHeading
                  title="Qu'est-ce qui changera d'une version à l'autre ?"
                  description="Facultatif. Après le brief, Claude propose la liste des variables en partant de tes suggestions et du brief : tu la corriges et la valides avant le storyboard."
                />
                <div className="space-y-3">
                  {suggestions.map((suggestion, i) => (
                    <div key={i} className="grid gap-2 rounded-lg border bg-card p-3 sm:grid-cols-[1fr_11rem_1fr_auto] sm:items-center">
                      <Input
                        aria-label="Variable"
                        value={suggestion.label}
                        onChange={(e) => updateSuggestion(i, { label: e.target.value })}
                        placeholder="Ex. : titre principal"
                        autoFocus={i === suggestions.length - 1}
                      />
                      <Select value={suggestion.type} onValueChange={(type) => updateSuggestion(i, { type })}>
                        <SelectTrigger aria-label="Type" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SUGGESTION_TYPES.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        aria-label="Exemple"
                        value={suggestion.example}
                        onChange={(e) => updateSuggestion(i, { example: e.target.value })}
                        placeholder="Exemple de valeur (facultatif)"
                      />
                      <Button type="button" variant="ghost" size="icon" onClick={() => setSuggestions((current) => current.filter((_, j) => j !== i))}>
                        <XIcon />
                        <span className="sr-only">Retirer</span>
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full border-dashed"
                    onClick={() => setSuggestions((current) => [...current, { label: "", type: "texte", example: "" }])}
                  >
                    <PlusIcon />
                    Suggérer une variable
                  </Button>
                </div>
              </>
            )}

            {step === "recap" && (
              <>
                <StepHeading
                  title="Tout est bon ?"
                  description={
                    kind === "template"
                      ? "Après la création, lance le brief : Claude le rédige puis te propose les variables à valider."
                      : type === "image"
                        ? "Après la création, lance le brief : Claude le rédige puis compose l'image, que tu valideras."
                        : "Après la création, lance le brief : Claude le rédige puis prépare le plan, que tu valideras."
                  }
                />
                <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-[auto_1fr]">
                  {message && (
                    <>
                      <dt className="text-muted-foreground">Message</dt>
                      <dd className="whitespace-pre-wrap">{message}</dd>
                    </>
                  )}
                  {audience && (
                    <>
                      <dt className="text-muted-foreground">Audience</dt>
                      <dd>{audience}</dd>
                    </>
                  )}
                  {notes && (
                    <>
                      <dt className="text-muted-foreground">Notes</dt>
                      <dd className="whitespace-pre-wrap">{notes}</dd>
                    </>
                  )}
                  {backgrounds.length > 0 && (
                    <>
                      <dt className="text-muted-foreground">Images de fond</dt>
                      <dd>{backgrounds.map((f) => f.name).join(", ")}</dd>
                    </>
                  )}
                  {mainFile.length + extras.length > 0 && (
                    <>
                      <dt className="text-muted-foreground">Fichiers</dt>
                      <dd>{[...mainFile, ...extras].map((f) => f.name).join(", ")}</dd>
                    </>
                  )}
                </dl>
                {progress && (
                  <div className="space-y-2 rounded-lg border bg-muted/40 p-4">
                    <p className="text-sm text-muted-foreground">{progress}</p>
                    <Progress value={null} className="animate-pulse" />
                  </div>
                )}
              </>
            )}
          </CardContent>

          <CardFooter className="justify-between gap-3 px-6 py-4 md:px-8">
            <Button type="button" variant="ghost" onClick={() => (index === 0 ? router.back() : setIndex(index - 1))} disabled={progress !== null}>
              <ArrowLeftIcon />
              {index === 0 ? "Annuler" : "Précédent"}
            </Button>
            <div className="flex items-center gap-4">
              <span className="hidden text-xs text-muted-foreground tabular-nums sm:inline">
                Étape {index + 1} sur {steps.length}
              </span>
              {step === "recap" ? (
                <Button size="lg" onClick={create} disabled={progress !== null}>
                  {progress ? "Création…" : `Créer ${noun}`}
                  <ArrowRightIcon />
                </Button>
              ) : (
                <Button size="lg" onClick={() => setIndex(index + 1)} disabled={!ready[step]}>
                  Suivant
                  <ArrowRightIcon />
                </Button>
              )}
            </div>
          </CardFooter>
        </Card>

        <CreationSummary
          type={type}
          kind={kind}
          projectLabel={projectLabel}
          isNewProject={projectId === "new"}
          name={name}
          workflowLabel={chosen?.label}
          engineLabel={blocksAvailable ? ENGINES.find((option) => option.value === engine)?.label : undefined}
          format={format}
          frame={footage ? null : ASPECTS[aspect].width / ASPECTS[aspect].height}
          cover={cover}
          files={[...mainFile, ...backgrounds, ...extras]}
          variables={kind === "template" ? filledSuggestions.map((suggestion) => suggestion.label) : undefined}
        />
      </div>
    </div>
  );
}
