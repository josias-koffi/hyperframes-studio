import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  assembleStills,
  assembleVideo,
  blockManifestSchema,
  blocksCatalog,
  blocksVariablesAnswerSchema,
  blocksVariablesJsonSchema,
  BINDABLE_VARIABLE_TYPES,
  briefDocJsonSchema,
  briefDocSchema,
  briefFormatLine,
  compositionVariablesSchema,
  CUSTOM_BLOCK,
  customScenePath,
  sceneCompositionId,
  parseJsonAnswer,
  parseStoryboard,
  renderBriefMd,
  renderScriptMd,
  renderStoryboardHtml,
  renderStoryboardMd,
  sceneMidpoints,
  storyboardJsonSchema,
  applyVisualCorrections,
  visualReviewJsonSchema,
  visualReviewSchema,
  type AssembledVideo,
  type ReviewedIssue,
  type AudioMeta,
  type BlockManifest,
  type BriefFormat,
  type CompositionVariable,
  type CreationKind,
  type CreationType,
  type GenerationStep,
  type LoadedBlock,
  type StoryboardFormat,
  type Storyboard,
  type StudioEvent,
  type TokenUsage,
} from "@studio/shared";
import { addUsage, ANSWERS_WITHOUT_ESCALATION, structuredCall, type Escalation } from "./structured";

/**
 * What a blocks step hands back to `processClaudeJob`, in the shape of an agent turn. `costUsd` is what the agent
 * turns cost (the structured calls are counted by the proxy), `escalation` is set when the escalation model took over.
 */
export type BlocksStepResult = { ok: boolean; resultText: string | null; usage?: TokenUsage; costUsd?: number; escalation?: Escalation };

/** Two escalations of the same step (a storyboard rewritten, then repaired after a check) add up. */
function mergeEscalation(a: Escalation | undefined, b: Escalation | undefined): Escalation | undefined {
  return !a ? b : !b ? a : { model: b.model, costUsd: a.costUsd + b.costUsd };
}

/** An agent turn in the workspace, for the scenes no block covers (`custom`). */
export type CustomSceneAgent = (prompt: string) => Promise<BlocksStepResult>;

export type BlocksContext = {
  workspaceDir: string;
  slug: string;
  step: GenerationStep;
  format: StoryboardFormat;
  /** Campaign name and context, shared by the créations of the project. */
  campaign: string;
  feedback?: string;
  /** What the brief and the variables are written from; without it, those steps cannot run. */
  creation?: { type: CreationType; kind: CreationKind; brief: Record<string, unknown> };
  /** OpenRouter id of the model of the structured calls (brief, variables, storyboard, a build comment). */
  model: string | null;
  /** OpenRouter id of the stronger model a call falls back to after two refused answers or two failed checks. */
  escalationModel?: string | null;
  /** OpenRouter id of a model with vision that reads the contact sheet after the build; null: no visual check. */
  visualModel?: string | null;
  /** The job's proxy token: the call is billed to the job like the voice and the music. */
  openrouter: { baseUrl: string; token: string } | null;
  /** Environment of the workspace scripts (`audio.mjs`, the HyperFrames CLI). */
  env: Record<string, string>;
  timeoutMs: number;
  onEvent: (event: StudioEvent) => Promise<void> | void;
  fetchImpl?: typeof fetch;
  /** Writes a custom scene; without it, a storyboard with a custom scene cannot be built. */
  customScene?: CustomSceneAgent;
};

/** Answers the model may give before one passes the schema and the block rules, without escalation. */
export const STORYBOARD_ATTEMPTS = ANSWERS_WITHOUT_ESCALATION;

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** The blocks of the workspace (`blocks/<id>/block.json` + `block.html`), synced from the app's skeleton. */
export async function loadBlocks(workspaceDir: string): Promise<{ manifests: BlockManifest[]; blocks: Map<string, LoadedBlock> }> {
  const root = join(workspaceDir, "blocks");
  const manifests: BlockManifest[] = [];
  const blocks = new Map<string, LoadedBlock>();
  for (const entry of (await readdir(root).catch(() => [])).sort()) {
    const dir = join(root, entry);
    if (!(await exists(join(dir, "block.json")))) continue;
    const manifest = blockManifestSchema.parse(JSON.parse(await readFile(join(dir, "block.json"), "utf8")));
    if (manifest.id !== entry) throw new Error(`blocks/${entry}/block.json : l'id « ${manifest.id} » doit être le nom du dossier`);
    manifests.push(manifest);
    blocks.set(manifest.id, { manifest, html: await readFile(join(dir, "block.html"), "utf8") });
  }
  if (manifests.length === 0) throw new Error(`aucun bloc dans ${root}`);
  return { manifests, blocks };
}

/** Files the model may point at: everything under `assets/` but the audio the studio writes itself. */
export async function availableAssets(videoDir: string): Promise<string[]> {
  const found: string[] = [];
  async function walk(relative: string) {
    for (const entry of await readdir(join(videoDir, relative), { withFileTypes: true }).catch(() => [])) {
      const path = `${relative}/${entry.name}`;
      if (entry.isDirectory()) {
        if (path !== "assets/audio") await walk(path);
      } else if (/\.(png|jpe?g|webp|gif|svg|avif)$/i.test(entry.name)) found.push(path);
    }
  }
  await walk("assets");
  return found.sort();
}

export function storyboardSystemPrompt(manifests: readonly BlockManifest[], format: StoryboardFormat): string {
  const rules = format.frames ? stillRules(format.frames) : videoRules(format);
  return [
    ...rules,
    "",
    "# Forme de la réponse",
    "",
    "Exactement ces champs, rien d'autre (les valeurs ne sont qu'un exemple) :",
    "",
    "```json",
    JSON.stringify(answerShape(format)),
    "```",
    "",
    `Cadre : ${format.width}×${format.height} px.`,
    "",
    "# Catalogue des blocs",
    "",
    blocksCatalog(manifests, format),
    ...(format.variables?.length ? ["", templateSection(format.variables)] : []),
  ].join("\n");
}

/**
 * An example of the whole answer: the JSON schema only reaches a model through `response_format: json_schema`, and
 * a model that refuses it (the `json_object` fallback) would otherwise guess the shape.
 */
export function answerShape(format: StoryboardFormat): Record<string, unknown> {
  const variables = format.variables?.length ? { variables: { text: format.variables[0].id } } : {};
  if (format.frames)
    return {
      version: 1,
      title: "Titre court",
      audio: { voice: false, music: null },
      scenes: [{ id: "s1", title: "Accroche", block: "hook-kinetic", duration: 1, props: { text: "…" }, voiceover: "", transition: "cut", ...variables }],
      overlays: [],
    };
  return {
    version: 1,
    title: "Titre court",
    audio: { voice: true, music: "warm lo-fi, instrumental, 90 bpm" },
    scenes: [
      { id: "s1", title: "Accroche", block: "hook-kinetic", duration: 2.5, props: { text: "…", highlight: "…" }, voiceover: "…", transition: "cut", ...variables },
      { id: "s2", title: "Fin", block: "cta-end", duration: 3, props: { headline: "…", action: "…" }, voiceover: "…", transition: "fade" },
    ],
    overlays: [{ id: "o1", block: "captions-karaoke", from: "s1", to: "s2", props: {} }],
  };
}

/** A carousel (`frames` slides) or an image (1): one block per slide, no time, no sound. */
function stillRules(frames: number): string[] {
  const image = frames === 1;
  return [
    image
      ? "Tu es le directeur artistique d'un studio de contenus pour les réseaux sociaux. Tu composes une image fixe en choisissant un bloc dans un catalogue et en remplissant ses props."
      : `Tu es le directeur artistique d'un studio de contenus pour les réseaux sociaux. Tu écris un carrousel de ${frames} slides en choisissant un bloc par slide dans un catalogue et en remplissant leurs props.`,
    "Tu réponds uniquement par un objet JSON conforme au schéma, sans texte autour.",
    "",
    "Règles :",
    image
      ? "- Exactement une scène : l'image. Choisis le bloc qui porte le message le plus fort."
      : `- Exactement ${frames} scènes, une par slide, dans l'ordre. La première accroche (hook-kinetic ou title-subtitle), la dernière appelle à l'action (cta-end), une idée par slide entre les deux.`,
    "- Varie les blocs : pas deux fois de suite le même bloc, sauf raison claire.",
    "- Respecte la longueur maximale de chaque texte : un texte trop long est refusé. Écris court, concret, en français naturel, sans emoji.",
    "- Une image ne peut venir que de la liste des fichiers disponibles. Sans fichier adapté, n'utilise pas de bloc d'image.",
    "- Garde une identité visuelle commune : mêmes couleurs d'accent et de texte d'une slide à l'autre, sauf raison claire. Les couleurs s'écrivent #RRGGBB.",
    "- Pas de son ni de mouvement : `duration` vaut 1, `transition` vaut cut, `voiceover` est vide, `audio` vaut { \"voice\": false, \"music\": null } et `overlays` est une liste vide.",
    "- Les ids de scène vont de s1 à sN dans l'ordre.",
  ];
}

function videoRules(format: StoryboardFormat): string[] {
  return [
    "Tu es le réalisateur d'un studio de vidéos courtes (publicités, TikTok, Reels). Tu écris le storyboard d'une vidéo en choisissant des blocs dans un catalogue et en remplissant leurs props.",
    "Tu réponds uniquement par un objet JSON conforme au schéma, sans texte autour.",
    "",
    "Règles :",
    "- Une idée par scène. Une vidéo courte commence par une accroche (hook-kinetic) et finit par un appel à l'action (cta-end).",
    "- Varie les blocs : pas deux fois de suite le même bloc, sauf raison claire.",
    "- Respecte la longueur maximale de chaque texte : un texte trop long est refusé. Écris court, concret, en français naturel, sans emoji.",
    "- La durée d'une scène suit son texte : environ 2,5 mots lus par seconde, sans sortir des bornes du bloc.",
    format.durationSeconds ? `- La somme des durées vise ${format.durationSeconds} s.` : "- Garde la vidéo sous 45 s.",
    "- Une image ne peut venir que de la liste des fichiers disponibles. Sans fichier adapté, n'utilise pas de bloc d'image.",
    "- Garde une identité visuelle commune : mêmes couleurs d'accent et de texte d'une scène à l'autre, sauf raison claire. Les couleurs s'écrivent #RRGGBB.",
    "- Voix off : si `audio.voice` vaut true, chaque scène a une phrase parlée (`voiceover`) qui complète l'écran au lieu de le répéter mot pour mot ; sinon tous les `voiceover` sont vides.",
    "- `audio.music` est une description en anglais de la musique (ambiance, tempo, instrumental, sans voix), ou null. Une vidéo sans voix off peut avoir une musique.",
    "- `overlays` pose des calques par-dessus les scènes, de la scène `from` à la scène `to` (ids o1, o2…) : des sous-titres sur toute la vidéo quand il y a une voix off, un bandeau nom-fonction sur une scène. Liste vide si rien ne s'y prête.",
    `- Le bloc \`${CUSTOM_BLOCK}\` est une scène sur mesure, écrite à part par un agent : seulement quand aucun bloc ne convient.`,
    "- Les ids de scène vont de s1 à sN dans l'ordre. `transition` vaut cut, fade ou slide-up ; la première scène est en cut.",
  ];
}

function templateSection(variables: NonNullable<StoryboardFormat["variables"]>): string {
  return [
    "# Variables du template",
    "",
    "Cette vidéo est un template : elle sera déclinée en changeant ces variables. Montre chacune par au moins une prop texte ou image d'une scène de blocs, indiquée dans `scenes[].variables` (`{\"prop\": \"id\"}`) ; la prop prend la valeur par défaut de la variable. Choisis pour chacune un bloc dont la prop tient sa longueur.",
    "",
    ...variables.map((variable) => {
      const max = variable.type === "string" && variable.maxLength ? `, ${variable.maxLength} caractères max` : "";
      return `- ${variable.id} (${variable.type}${max}) : ${variable.label} — défaut ${JSON.stringify(variable.default)}`;
    }),
  ].join("\n");
}

export function storyboardUserPrompt({
  campaign,
  brief,
  assets,
  current,
  feedback,
}: {
  campaign: string;
  brief: string;
  assets: readonly string[];
  current?: Storyboard | null;
  feedback?: string;
}): string {
  const parts = [
    "## Campagne",
    "",
    campaign.trim() || "(pas de contexte de campagne)",
    "",
    "## Brief validé",
    "",
    brief.trim(),
    "",
    "## Fichiers disponibles",
    "",
    assets.length ? assets.map((asset) => `- ${asset}`).join("\n") : "(aucun)",
  ];
  if (current && feedback) {
    parts.push(
      "",
      "## Storyboard actuel",
      "",
      "```json",
      JSON.stringify(current, null, 2),
      "```",
      "",
      "## Demande de l'utilisateur",
      "",
      feedback.trim(),
      "",
      "Applique cette demande au storyboard actuel et renvoie le storyboard complet. Ne change rien d'autre que ce qu'elle touche.",
    );
  } else {
    parts.push("", "Écris le storyboard de cette vidéo.");
  }
  return parts.join("\n");
}

/**
 * Asks the model for STORYBOARD.json until it passes the schema and the block rules; after two refusals the
 * escalation model takes over (`structuredCall`).
 */
export async function writeStoryboard(
  ctx: BlocksContext,
  input: { manifests: readonly BlockManifest[]; brief: string; assets: readonly string[]; current?: Storyboard | null; model?: string },
): Promise<{ storyboard: Storyboard | null; warnings: string[]; errors: string[]; usage?: TokenUsage; costUsd: number; escalation?: Escalation }> {
  const outcome = await structuredCall(ctx, {
    label: "Storyboard",
    name: "storyboard",
    schema: storyboardJsonSchema(input.manifests),
    model: input.model ?? ctx.model!,
    escalationModel: ctx.escalationModel,
    messages: [
      { role: "system", content: storyboardSystemPrompt(input.manifests, ctx.format) },
      { role: "user", content: storyboardUserPrompt({ campaign: ctx.campaign, brief: input.brief, assets: input.assets, current: input.current, feedback: ctx.feedback }) },
    ],
    check: async (content) => {
      const parsed = parseStoryboard(content, input.manifests, ctx.format);
      const errors = [...parsed.errors, ...(parsed.storyboard ? await missingImages(ctx, parsed.storyboard, input.manifests, input.assets) : [])];
      return { value: parsed.storyboard, errors, warnings: parsed.warnings };
    },
  });
  return { storyboard: outcome.value, warnings: outcome.warnings, errors: outcome.errors, usage: outcome.usage, costUsd: outcome.costUsd, escalation: outcome.escalation };
}

async function missingImages(ctx: BlocksContext, storyboard: Storyboard, manifests: readonly BlockManifest[], assets: readonly string[]): Promise<string[]> {
  const byId = new Map(manifests.map((manifest) => [manifest.id, manifest]));
  const errors: string[] = [];
  for (const scene of storyboard.scenes) {
    for (const [key, prop] of Object.entries(byId.get(scene.block)?.props ?? {})) {
      const value = scene.props[key];
      if (prop.type === "image" && value && !assets.includes(value))
        errors.push(`scène ${scene.id} : « ${value} » n'est pas dans les fichiers disponibles.`);
    }
  }
  return errors;
}

function videoDir(ctx: BlocksContext): string {
  return join(ctx.workspaceDir, "videos", ctx.slug);
}

async function readStoryboard(ctx: BlocksContext, manifests: readonly BlockManifest[]): Promise<{ storyboard: Storyboard | null; errors: string[]; warnings: string[] }> {
  const path = join(videoDir(ctx), "STORYBOARD.json");
  if (!(await exists(path))) return { storyboard: null, errors: ["STORYBOARD.json absent : relance l'étape storyboard."], warnings: [] };
  return parseStoryboard(await readFile(path, "utf8"), manifests, ctx.format);
}

async function saveStoryboard(ctx: BlocksContext, storyboard: Storyboard, manifests: readonly BlockManifest[], warnings: readonly string[]) {
  const dir = videoDir(ctx);
  await writeFile(join(dir, "STORYBOARD.json"), `${JSON.stringify(storyboard, null, 2)}\n`);
  if (!ctx.format.frames) await writeFile(join(dir, "SCRIPT.md"), renderScriptMd(storyboard));
  await writeFile(join(dir, "STORYBOARD.md"), renderStoryboardMd(storyboard, manifests, warnings));
  await writeFile(join(dir, "storyboard.html"), renderStoryboardHtml(storyboard, manifests));
}

/** Runs a workspace command and streams its output as log events; resolves with its exit code and output tail. */
export function runCommand(
  ctx: Pick<BlocksContext, "workspaceDir" | "env" | "onEvent">,
  command: string,
  args: string[],
  timeoutMs: number,
): Promise<{ code: number | null; output: string }> {
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, { cwd: ctx.workspaceDir, env: ctx.env, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    let pending = "";
    const onData = (chunk: Buffer) => {
      const text = chunk.toString();
      output = (output + text).slice(-20_000);
      pending += text;
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) if (line.trim()) void ctx.onEvent({ kind: "log", level: "info", text: line });
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      resolvePromise({ code: null, output: `${output}\n${error.message}` });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (pending.trim()) void ctx.onEvent({ kind: "log", level: "info", text: pending });
      resolvePromise({ code, output });
    });
  });
}

/** `hyperframes@X.Y.Z` pinned by the workspace scripts, so the snapshot runs the same CLI as `check`. */
export async function pinnedHyperframes(workspaceDir: string): Promise<string> {
  const pkg = JSON.parse(await readFile(join(workspaceDir, "package.json"), "utf8")) as { scripts?: Record<string, string> };
  return /hyperframes@[0-9][0-9A-Za-z.-]*/.exec(pkg.scripts?.check ?? "")?.[0] ?? "hyperframes";
}

const tail = (text: string, size = 3000) => (text.length > size ? `…${text.slice(-size)}` : text);

async function storyboardStep(
  ctx: BlocksContext,
  manifests: BlockManifest[],
  current: Storyboard | null,
  { escalated = false }: { escalated?: boolean } = {},
): Promise<BlocksStepResult> {
  const missing = needsModel(ctx);
  if (missing) return missing;
  const dir = videoDir(ctx);
  const briefPath = join(dir, "BRIEF.md");
  if (!(await exists(briefPath))) return { ok: false, resultText: "BRIEF.md absent : relance l'étape brief." };
  const result = await writeStoryboard(ctx, {
    manifests,
    brief: await readFile(briefPath, "utf8"),
    assets: await availableAssets(dir),
    current,
  });
  // Called as the escalation itself (a build repaired by the escalation model), the whole call is the escalation.
  const escalation = escalated ? { model: ctx.model!, costUsd: result.costUsd } : result.escalation;
  if (!result.storyboard) return { ok: false, resultText: `Storyboard refusé :\n- ${result.errors.join("\n- ")}`, usage: result.usage, escalation };
  await saveStoryboard(ctx, result.storyboard, manifests, result.warnings);
  const { storyboard } = result;
  const total = storyboard.scenes.reduce((sum, scene) => sum + scene.duration, 0);
  const lines = storyboard.scenes.map((scene, index) => `${index + 1}. ${scene.title} (${scene.block}, ${scene.duration} s)`);
  return {
    ok: true,
    resultText: [`${storyboard.scenes.length} scènes, environ ${total.toFixed(1)} s.`, ...lines, ...result.warnings].join("\n"),
    usage: result.usage,
    escalation,
  };
}

async function mediaStep(ctx: BlocksContext, manifests: BlockManifest[]): Promise<BlocksStepResult> {
  const { storyboard, errors } = await readStoryboard(ctx, manifests);
  if (!storyboard) return { ok: false, resultText: errors.join("\n") };
  const { voice, music } = storyboard.audio;
  if (!voice && !music) return { ok: true, resultText: "Ni voix off ni musique : aucun média à produire." };
  const args = ["scripts/audio.mjs", `videos/${ctx.slug}`];
  if (music) args.push("--music", music);
  // Without a voice, nothing stretches the scenes: the music lasts as long as the storyboard.
  if (!voice) args.push("--steps", "music,meta", "--duration", String(storyboard.scenes.reduce((sum, scene) => sum + scene.duration, 0)));
  const run = await runCommand(ctx, "node", args, ctx.timeoutMs);
  if (run.code !== 0) return { ok: false, resultText: `scripts/audio.mjs a échoué (code ${run.code}) :\n${tail(run.output)}` };
  return { ok: true, resultText: voice ? `Voix off${music ? " et musique" : ""} en place (audio_meta.json).` : "Musique en place (audio_meta.json)." };
}

/** What an agent needs to write one custom scene, every rule in the prompt: it does not read the skills. */
export function customScenePrompt({
  slug,
  sceneId,
  description,
  duration,
  width,
  height,
  safeBottom,
  colors,
}: {
  slug: string;
  sceneId: string;
  description: string;
  duration: number;
  width: number;
  height: number;
  safeBottom: number;
  colors: readonly string[];
}): string {
  const id = sceneCompositionId(sceneId);
  const path = `videos/${slug}/${customScenePath(sceneId)}`;
  return [
    `Tu écris une seule scène d'une vidéo HyperFrames assemblée par le studio : le fichier \`${path}\`. Ne modifie aucun autre fichier : le reste de la vidéo est généré.`,
    "",
    "## La scène",
    "",
    description.trim(),
    "",
    `Durée : ${duration} s · Cadre : ${width}×${height} px${colors.length ? ` · Couleurs du reste de la vidéo : ${colors.join(", ")}` : ""}.`,
    "",
    "## Format du fichier",
    "",
    "- Un `<template>` qui contient un `<style>`, la racine puis un `<script>` : rien hors du template n'est lu.",
    `- La racine : \`<div id="root" data-composition-id="${id}" data-width="${width}" data-height="${height}">\`, stylée par \`#root\` (position: absolute; inset: 0; overflow: hidden; un fond opaque), jamais par une classe.`,
    `- Les enfants sont stylés par des classes simples et leurs ids préfixés : \`id="${id}-titre"\`.`,
    "- Chaque élément visible que l'on voudra modifier (titre, texte, forme, image) est un élément à part, nommé en français par `data-label=\"…\"` (jamais `data-layer`). Les textes sont du texte simple, les images des `<img>` venant de `assets/`.",
    `- Une seule timeline GSAP en pause (gsap est déjà chargé) : \`const tl = gsap.timeline({ paused: true });\` … \`window.__timelines["${id}"] = tl;\`. L'animation occupe les ${duration} s.`,
    "- Logique déterministe : pas de Date.now(), de Math.random(), de réseau, de police ou d'image externe.",
    "- Jamais deux `fromTo` sur la même cible : pour un second mouvement, anime un élément parent.",
    "- Le texte reste lisible sur son fond (contraste 3:1 au moins pour le gros texte, 4,5:1 sinon) ; jamais de texte écrit dans sa propre couleur d'accent.",
    "- Un texte animé dans un masque `overflow: hidden` a `padding-bottom: 0.08em` et `line-height` d'au moins 1.08.",
    ...(safeBottom ? [`- Les ${safeBottom} px du bas du cadre sont réservés aux sous-titres : aucun texte dedans (un fond ou une image peut y aller).`] : []),
    "",
    "## Vérifier",
    "",
    `Lance \`npm run check -- videos/${slug}\` et corrige ta scène jusqu'à 0 erreur sur ${customScenePath(sceneId)}. Les autres scènes ne te concernent pas.`,
    "Réponds en une phrase : ce que montre la scène.",
  ].join("\n");
}

/**
 * Writes the custom scenes whose description, slot or frame changed since their last build (the agent's turn is
 * the slow part): `.media/custom/<id>.sha` remembers what each file was written for.
 */
async function buildCustomScenes(
  ctx: BlocksContext,
  storyboard: Storyboard,
  { slots, safeBottoms }: Pick<AssembledVideo, "slots" | "safeBottoms">,
): Promise<BlocksStepResult> {
  const dir = videoDir(ctx);
  const colors = [...new Set(storyboard.scenes.flatMap((scene) => Object.values(scene.props).filter((value) => /^#[0-9a-fA-F]{6}$/.test(value))))];
  let usage: TokenUsage | undefined;
  let costUsd: number | undefined;
  const written: string[] = [];
  for (const scene of storyboard.scenes.filter((candidate) => candidate.block === CUSTOM_BLOCK)) {
    const duration = slots[scene.id] ?? scene.duration;
    const input = {
      slug: ctx.slug,
      sceneId: scene.id,
      description: scene.props.description ?? "",
      duration,
      width: ctx.format.width,
      height: ctx.format.height,
      safeBottom: safeBottoms[scene.id] ?? 0,
      colors,
    };
    const sha = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    const file = join(dir, customScenePath(scene.id));
    const shaFile = join(dir, ".media", "custom", `${scene.id}.sha`);
    if ((await exists(file)) && (await readFile(shaFile, "utf8").catch(() => "")) === sha) continue;
    if (!ctx.customScene) return { ok: false, resultText: `La scène ${scene.id} est sur mesure, mais aucun agent n'est disponible pour l'écrire.` };
    await ctx.onEvent({ kind: "log", level: "info", text: `Scène sur mesure ${scene.id} : un agent l'écrit.` });
    await mkdir(dirname(file), { recursive: true });
    const turn = await ctx.customScene(customScenePrompt(input));
    usage = addUsage(usage, turn.usage);
    if (turn.costUsd !== undefined) costUsd = (costUsd ?? 0) + turn.costUsd;
    const html = await readFile(file, "utf8").catch(() => "");
    if (!turn.ok || !html.includes(`data-composition-id="${sceneCompositionId(scene.id)}"`))
      return { ok: false, resultText: `La scène sur mesure ${scene.id} n'a pas été écrite dans ${customScenePath(scene.id)}.\n${turn.resultText ?? ""}`.trim(), usage, costUsd };
    await mkdir(dirname(shaFile), { recursive: true });
    await writeFile(shaFile, sha);
    written.push(scene.id);
  }
  return { ok: true, resultText: written.length ? `Scènes sur mesure écrites : ${written.join(", ")}.` : null, usage, costUsd };
}

/** A round of the build: STORYBOARD.json assembled, its custom scenes written and `check` run on the result. */
type BuildRound = BlocksStepResult & { assembled?: AssembledVideo; storyboard?: Storyboard; checkOutput?: string };

async function assembleAndCheck(ctx: BlocksContext, manifests: BlockManifest[], blocks: Map<string, LoadedBlock>): Promise<BuildRound> {
  const dir = videoDir(ctx);
  const { storyboard, errors } = await readStoryboard(ctx, manifests);
  if (!storyboard) return { ok: false, resultText: errors.join("\n") };
  const metaPath = join(dir, "audio_meta.json");
  const audio = (await exists(metaPath)) ? (JSON.parse(await readFile(metaPath, "utf8")) as AudioMeta) : null;
  const { width, height, variables } = ctx.format;
  const assembled = ctx.format.frames
    ? assembleStills({ storyboard, blocks, width, height, variables })
    : assembleVideo({ storyboard, blocks, width, height, audio, variables });
  // The scenes are regenerated from STORYBOARD.json: a scene removed from the storyboard must not linger.
  await rm(join(dir, "compositions", "scenes"), { recursive: true, force: true });
  await writeFile(join(dir, "index.html"), assembled.indexHtml);
  for (const [path, html] of Object.entries(assembled.files)) {
    await mkdir(dirname(join(dir, path)), { recursive: true });
    await writeFile(join(dir, path), html);
  }
  await ctx.onEvent({ kind: "log", level: "info", text: `Composition assemblée : ${storyboard.scenes.length} scènes, ${assembled.duration} s.` });
  const custom = await buildCustomScenes(ctx, storyboard, assembled);
  if (!custom.ok) return custom;
  const check = await runCommand(ctx, "npm", ["run", "check", "--", `videos/${ctx.slug}`], ctx.timeoutMs);
  return { ...custom, assembled, storyboard, checkOutput: check.code === 0 ? undefined : tail(check.output) };
}

/** Snapshots at the middle of each scene, and the contact sheet the review shows; false when they failed. */
async function snapshot(ctx: BlocksContext, assembled: AssembledVideo): Promise<boolean> {
  const cli = await pinnedHyperframes(ctx.workspaceDir);
  const at = sceneMidpoints(assembled.timings).join(",");
  const run = await runCommand(ctx, "npx", ["--yes", cli, "snapshot", `videos/${ctx.slug}`, "--at", at], ctx.timeoutMs);
  if (run.code !== 0) await ctx.onEvent({ kind: "log", level: "error", text: `Snapshots impossibles (code ${run.code}) : la planche de relecture manque.` });
  return run.code === 0;
}

export function visualCheckSystemPrompt(): string {
  return [
    "Tu es directeur artistique dans un studio de contenus pour les réseaux sociaux. Tu relis la planche de contrôle d'une création assemblée à partir de blocs : une vignette par scène, dans l'ordre, prise au milieu de la scène.",
    "Tu réponds uniquement par un objet JSON conforme au schéma, sans texte autour.",
    "",
    "Cherche seulement des défauts visibles, pas des questions de goût :",
    "- texte coupé, qui sort du cadre ou de son bloc ;",
    "- texte illisible : contraste trop faible avec son fond, texte trop petit ;",
    "- éléments qui se chevauchent alors qu'ils ne devraient pas ;",
    "- image déformée, vide ou sans rapport avec la scène ;",
    "- faute d'orthographe visible.",
    "",
    "Pour chaque défaut : `scene` (l'id de la scène), `problem` (une phrase), `severity` (high : la création n'est pas publiable ; medium : se voit ; low : détail) et `correction`.",
    "`correction` vaut { \"props\": { … } } avec de nouvelles valeurs pour des props existantes du bloc de la scène (un texte plus court, une autre couleur #RRGGBB qui contraste), ou null si changer des props ne suffit pas. Ne touche jamais une prop marquée « variable ».",
    "Pas de défaut : `issues` est une liste vide.",
  ].join("\n");
}

function visualCheckUserText(storyboard: Storyboard, manifests: readonly BlockManifest[]): string {
  const byId = new Map(manifests.map((manifest) => [manifest.id, manifest]));
  const scenes = storyboard.scenes.map((scene, index) => {
    const manifest = byId.get(scene.block);
    const props = Object.entries(manifest?.props ?? {}).map(([key, prop]) => {
      const max = prop.type === "text" && prop.maxLength ? `, ${prop.maxLength} car. max` : "";
      const bound = scene.variables[key] ? ", variable" : "";
      return `  - ${key} (${prop.type}${max}${bound}) = ${JSON.stringify(scene.props[key] ?? prop.default ?? "")}`;
    });
    return [`Vignette ${index + 1} : scène ${scene.id} « ${scene.title} », bloc ${scene.block}`, ...props].join("\n");
  });
  return ["## Scènes", "", ...scenes, "", "La planche suit."].join("\n");
}

/**
 * The contact sheet and the storyboard to a model with vision: the corrections it gives as props are applied (the
 * caller assembles again), the rest goes to `VISUAL_REVIEW.json` and into the step's summary for the review.
 */
async function visualCheck(
  ctx: BlocksContext,
  manifests: readonly BlockManifest[],
  storyboard: Storyboard,
): Promise<{ corrected: Storyboard | null; text: string | null; usage?: TokenUsage }> {
  const sheet = join(videoDir(ctx), "snapshots", "contact-sheet.jpg");
  if (!ctx.visualModel || !ctx.openrouter || !(await exists(sheet))) return { corrected: null, text: null };
  await ctx.onEvent({ kind: "log", level: "info", text: `Contrôle visuel de la planche par ${ctx.visualModel}.` });
  const image = `data:image/jpeg;base64,${(await readFile(sheet)).toString("base64")}`;
  const outcome = await structuredCall(ctx, {
    label: "Contrôle visuel",
    name: "visual_review",
    schema: visualReviewJsonSchema(),
    model: ctx.visualModel,
    // The escalation model may not read images.
    escalationModel: null,
    messages: [
      { role: "system", content: visualCheckSystemPrompt() },
      {
        role: "user",
        content: [
          { type: "text", text: visualCheckUserText(storyboard, manifests) },
          { type: "image_url", image_url: { url: image } },
        ],
      },
    ],
    check: async (content) => {
      const parsed = parseJsonAnswer(content, visualReviewSchema);
      const unknown = (parsed.value?.issues ?? []).filter((issue) => !storyboard.scenes.some((scene) => scene.id === issue.scene)).map((issue) => issue.scene);
      return unknown.length ? { value: null, errors: [`scènes inconnues : ${unknown.join(", ")}`] } : parsed;
    },
  });
  if (!outcome.value) {
    await ctx.onEvent({ kind: "log", level: "error", text: `Contrôle visuel impossible : ${outcome.errors.join(" ; ")}` });
    return { corrected: null, text: null, usage: outcome.usage };
  }
  const { storyboard: corrected, issues } = applyVisualCorrections(storyboard, outcome.value.issues, manifests, ctx.format);
  await writeFile(join(videoDir(ctx), "VISUAL_REVIEW.json"), `${JSON.stringify({ model: ctx.visualModel, issues }, null, 2)}\n`);
  return { corrected, text: visualSummary(issues), usage: outcome.usage };
}

const SEVERITY: Record<ReviewedIssue["severity"], string> = { high: "bloquant", medium: "visible", low: "détail" };

function visualSummary(issues: readonly ReviewedIssue[]): string {
  if (issues.length === 0) return "Contrôle visuel : rien à signaler.";
  const applied = issues.filter((issue) => issue.status === "applied");
  const open = issues.filter((issue) => issue.status === "open");
  return [
    ...(applied.length ? [`Contrôle visuel, corrigé : ${applied.map((issue) => `${issue.scene} (${issue.problem})`).join(" ; ")}`] : []),
    ...(open.length ? ["Contrôle visuel, à regarder :", ...open.map((issue) => `- ${issue.scene}, ${SEVERITY[issue.severity]} : ${issue.problem}`)] : []),
  ].join("\n");
}

/** Check failures after which the storyboard is repaired: by the step's model, then by the escalation model. */
export const CHECK_REPAIRS = 2;

function repairRequest(checkOutput: string): string {
  return [
    "Le check HyperFrames refuse la vidéo assemblée à partir de ce storyboard :",
    "",
    "```",
    checkOutput.trim(),
    "```",
    "",
    "Corrige les props des scènes en cause (texte trop long pour sa place, contraste insuffisant entre le texte et son fond, image qui ne convient pas) et ne change rien d'autre, ni la voix off ni les durées.",
  ].join("\n");
}

/**
 * Assembles and checks; a failed check sends its output to the model, which corrects the props, then the build runs
 * again. The second failure goes to the escalation model; the third one fails the step.
 */
async function buildStep(ctx: BlocksContext, manifests: BlockManifest[], blocks: Map<string, LoadedBlock>): Promise<BlocksStepResult> {
  let usage: TokenUsage | undefined;
  let costUsd: number | undefined;
  let escalation: Escalation | undefined;
  const notes: string[] = [];
  // The visual check runs once, on the first build that passes; `previous` is the storyboard before its corrections.
  let reviewed = false;
  let previous: Storyboard | null = null;
  const finish = (result: BlocksStepResult): BlocksStepResult => ({
    ...result,
    resultText: [...notes, result.resultText].filter(Boolean).join("\n"),
    usage,
    costUsd,
    escalation,
  });
  for (let failures = 0; ; ) {
    const round = await assembleAndCheck(ctx, manifests, blocks);
    usage = addUsage(usage, round.usage);
    if (round.costUsd !== undefined) costUsd = (costUsd ?? 0) + round.costUsd;
    if (round.resultText) notes.push(round.resultText);
    if (!round.ok) return finish({ ok: false, resultText: null });
    const { assembled, storyboard } = round as Required<Pick<BuildRound, "assembled" | "storyboard">>;
    if (round.checkOutput === undefined) {
      const snapped = await snapshot(ctx, assembled);
      const passed = `Check passé. ${storyboard.scenes.length} scènes, ${assembled.duration} s.`;
      if (!snapped || reviewed) return finish({ ok: true, resultText: passed });
      reviewed = true;
      const review = await visualCheck(ctx, manifests, storyboard);
      usage = addUsage(usage, review.usage);
      if (review.text) notes.push(review.text);
      if (!review.corrected) return finish({ ok: true, resultText: passed });
      // The corrections are assembled and checked like any storyboard; a check they break puts the previous one back.
      previous = storyboard;
      await saveStoryboard(ctx, review.corrected, manifests, []);
      continue;
    }
    if (previous) {
      await ctx.onEvent({ kind: "log", level: "error", text: "Les corrections du contrôle visuel font échouer le check : le storyboard précédent est remis." });
      notes.push("Corrections du contrôle visuel annulées : elles faisaient échouer le check.");
      await saveStoryboard(ctx, previous, manifests, []);
      previous = null;
      continue;
    }

    failures++;
    const escalating = failures === CHECK_REPAIRS;
    const model = escalating ? (ctx.escalationModel && ctx.escalationModel !== ctx.model ? ctx.escalationModel : null) : ctx.model;
    const failed = `Le check HyperFrames a échoué sur la composition assemblée :\n${round.checkOutput}`;
    if (failures > CHECK_REPAIRS || !model || !ctx.openrouter) return finish({ ok: false, resultText: failed });
    await ctx.onEvent({
      kind: "log",
      level: "info",
      text: escalating ? `Escalade : deuxième check en échec, ${model} corrige le storyboard.` : `Check en échec : ${model} corrige le storyboard.`,
    });
    const repaired = await storyboardStep({ ...ctx, model, escalationModel: escalating ? null : ctx.escalationModel, feedback: repairRequest(round.checkOutput) }, manifests, storyboard, {
      escalated: escalating,
    });
    usage = addUsage(usage, repaired.usage);
    escalation = mergeEscalation(escalation, repaired.escalation);
    if (!repaired.ok) return finish({ ok: false, resultText: `${failed}\n\nCorrection impossible : ${repaired.resultText}` });
    notes.push(`Check en échec : storyboard corrigé par ${model}.`);
  }
}

/** The format of the création, for the brief: a still has its slide count, a video its target duration. */
function briefFormat(ctx: BlocksContext): BriefFormat {
  const type = ctx.creation?.type ?? (ctx.format.frames ? (ctx.format.frames === 1 ? "image" : "carousel") : "video");
  return { type, width: ctx.format.width, height: ctx.format.height, durationSeconds: ctx.format.durationSeconds, frames: ctx.format.frames };
}

export function briefSystemPrompt(type: CreationType): string {
  const video = type === "video";
  return [
    "Tu es chef de projet dans un studio de contenus pour les réseaux sociaux. Tu transformes la demande saisie dans le studio en un brief clair, que le réalisateur suivra pour écrire le storyboard.",
    "Tu réponds uniquement par un objet JSON conforme au schéma, sans texte autour.",
    "",
    "Règles :",
    "- `points` reprend mot pour mot les faits, chiffres, citations, offres, dates, étapes et liens de la demande : le storyboard n'utilisera que ceux-là. N'invente jamais de chiffre, de témoignage ni de promesse.",
    "- `keyMessage` : la phrase que le public doit retenir, en une ligne.",
    "- `callToAction` : l'action demandée, avec le lien ou le code s'il y en a un ; vide si la demande n'en donne pas.",
    "- `tone` : le ton, d'après la demande et la campagne.",
    video
      ? "- `audio.voice` vaut false si la demande veut une vidéo muette ou sans voix off, true sinon. `audio.music` est une description courte en anglais de la musique (ambiance, tempo, instrumental), ou null si la demande n'en veut pas."
      : "- Pas de son : `audio` vaut { \"voice\": false, \"music\": null }.",
    "- Ce que la demande ne dit pas : choisis la valeur la plus raisonnable et note ce choix dans `assumptions`.",
    "- Écris en français naturel, sans emoji.",
    "",
    "# Forme de la réponse",
    "",
    "Exactement ces champs (les valeurs ne sont qu'un exemple) :",
    "",
    "```json",
    JSON.stringify({
      title: "Thermo, le café chaud 3 heures",
      objective: "…",
      audience: "…",
      keyMessage: "…",
      points: ["…", "…"],
      callToAction: "…",
      tone: "…",
      audio: video ? { voice: true, music: "light lo-fi, instrumental, 85 bpm" } : { voice: false, music: null },
      assumptions: ["…"],
    }),
    "```",
  ].join("\n");
}

export function briefUserPrompt({ campaign, brief, format, assets }: { campaign: string; brief: Record<string, unknown>; format: string; assets: readonly string[] }): string {
  return [
    "## Campagne",
    "",
    campaign.trim() || "(pas de contexte de campagne)",
    "",
    "## Demande saisie dans le studio (JSON)",
    "",
    "```json",
    JSON.stringify(brief, null, 2),
    "```",
    "",
    `## Format\n\n${format}`,
    "",
    "## Fichiers fournis",
    "",
    assets.length ? assets.map((asset) => `- ${asset}`).join("\n") : "(aucun)",
    "",
    "Écris le brief.",
  ].join("\n");
}

const needsModel = (ctx: BlocksContext): BlocksStepResult | null =>
  !ctx.model
    ? { ok: false, resultText: "Aucun modèle OpenRouter pour le moteur blocs : choisis OpenCode dans les réglages IA, ou renseigne BLOCKS_MODEL." }
    : !ctx.openrouter
      ? { ok: false, resultText: "Clé OpenRouter absente : le moteur blocs ne peut pas appeler le modèle." }
      : null;

/** BRIEF.json from what was typed in the studio, and BRIEF.md generated from it for the storyboard and the review. */
async function briefStep(ctx: BlocksContext): Promise<BlocksStepResult> {
  const missing = needsModel(ctx);
  if (missing) return missing;
  if (!ctx.creation) return { ok: false, resultText: "Brief du studio absent : impossible d'écrire BRIEF.json." };
  const dir = videoDir(ctx);
  const format = briefFormat(ctx);
  const outcome = await structuredCall(ctx, {
    label: "Brief",
    name: "brief",
    schema: briefDocJsonSchema(),
    model: ctx.model!,
    escalationModel: ctx.escalationModel,
    messages: [
      { role: "system", content: briefSystemPrompt(format.type) },
      { role: "user", content: briefUserPrompt({ campaign: ctx.campaign, brief: ctx.creation.brief, format: briefFormatLine(format), assets: await availableAssets(dir) }) },
    ],
    check: async (content) => parseJsonAnswer(content, briefDocSchema),
  });
  if (!outcome.value) return { ok: false, resultText: `Brief refusé :\n- ${outcome.errors.join("\n- ")}`, usage: outcome.usage, escalation: outcome.escalation };
  // A still has no sound, whatever the model said.
  const doc = format.type === "video" ? outcome.value : { ...outcome.value, audio: { voice: false, music: null } };
  await writeFile(join(dir, "BRIEF.json"), `${JSON.stringify(doc, null, 2)}\n`);
  await writeFile(join(dir, "BRIEF.md"), renderBriefMd(doc, format));
  const summary = [doc.title, doc.keyMessage, doc.assumptions.length ? `${doc.assumptions.length} hypothèse(s) : ${doc.assumptions.join(" ; ")}` : "Aucune hypothèse."];
  return { ok: true, resultText: summary.join("\n"), usage: outcome.usage, escalation: outcome.escalation };
}

export function variablesSystemPrompt(): string {
  return [
    "Tu prépares un template de contenu pour les réseaux sociaux : il sera réutilisé en changeant des variables, puis rendu sans toi. Tu proposes ces variables ; l'utilisateur les valide avant le storyboard.",
    "Tu réponds uniquement par un objet JSON conforme au schéma, sans texte autour.",
    "",
    "Règles :",
    "- Reprends chaque variable suggérée par l'utilisateur, puis ajoute celles que le brief rend évidentes : ce qui changera d'une déclinaison à l'autre (accroche, nom du produit, prix, date, texte du bouton, photo du produit). Garde fixe ce qui fait l'identité de la création (couleurs, logo, ton).",
    "- Peu de variables, chacune utile : 3 à 6 en général.",
    "- Le template est assemblé à partir de blocs : une variable n'est qu'un texte affiché ou le chemin d'une image, toujours de type `string`. Un prix ou une date s'écrit en texte (« 29 € », « Jusqu'au 30 novembre »).",
    "- `id` : minuscules, chiffres et _, en commençant par une lettre (ex. `headline`). `label` : en français, ce que l'utilisateur remplit. `default` : la valeur de la première version, tirée du brief.",
    "- Chaque texte affiché a `maxLength`, d'après la place qu'il aura : 20 à 40 pour une accroche ou un bouton, 60 à 90 pour une phrase. La valeur par défaut tient dans cette longueur.",
    "- Une image est un chemin vers un fichier fourni (`assets/uploads/…`), sans `maxLength`.",
    "",
    "# Forme de la réponse",
    "",
    "```json",
    JSON.stringify({
      variables: [
        { id: "headline", type: "string", label: "Accroche de l'offre", default: "-30 % sur le lin lavé", maxLength: 32 },
        { id: "product_photo", type: "string", label: "Photo du produit", default: "assets/uploads/produit.jpg" },
      ],
    }),
    "```",
  ].join("\n");
}

/** VARIABLES.json of a template on the blocks engine: a structured call, the user's comment applied to the current list. */
async function variablesStep(ctx: BlocksContext): Promise<BlocksStepResult> {
  const missing = needsModel(ctx);
  if (missing) return missing;
  const dir = videoDir(ctx);
  const briefPath = join(dir, "BRIEF.md");
  if (!(await exists(briefPath))) return { ok: false, resultText: "BRIEF.md absent : relance l'étape brief." };
  const current = ctx.feedback ? await readFile(join(dir, "VARIABLES.json"), "utf8").catch(() => null) : null;
  const suggested = ctx.creation?.brief.variables;
  const user = [
    "## Brief validé",
    "",
    (await readFile(briefPath, "utf8")).trim(),
    "",
    "## Fichiers fournis",
    "",
    (await availableAssets(dir)).map((asset) => `- ${asset}`).join("\n") || "(aucun)",
    ...(suggested ? ["", "## Variables suggérées par l'utilisateur", "", "```json", JSON.stringify(suggested, null, 2), "```"] : []),
    ...(current && ctx.feedback
      ? ["", "## Variables actuelles", "", "```json", current.trim(), "```", "", "## Demande de l'utilisateur", "", ctx.feedback.trim(), "", "Applique cette demande et renvoie la liste complète."]
      : ["", "Propose les variables de ce template."]),
  ].join("\n");
  const outcome = await structuredCall(ctx, {
    label: "Variables",
    name: "variables",
    schema: blocksVariablesJsonSchema(),
    model: ctx.model!,
    escalationModel: ctx.escalationModel,
    messages: [
      { role: "system", content: variablesSystemPrompt() },
      { role: "user", content: user },
    ],
    check: async (content) => {
      const parsed = parseJsonAnswer(content, blocksVariablesAnswerSchema);
      return { value: parsed.value?.variables ?? null, errors: parsed.errors };
    },
  });
  if (!outcome.value) return { ok: false, resultText: `Variables refusées :\n- ${outcome.errors.join("\n- ")}`, usage: outcome.usage, escalation: outcome.escalation };
  const variables: CompositionVariable[] = outcome.value;
  await writeFile(join(dir, "VARIABLES.json"), `${JSON.stringify(variables, null, 2)}\n`);
  return {
    ok: true,
    resultText: variables.map((variable) => `${variable.id} : ${variable.label}`).join("\n"),
    usage: outcome.usage,
    escalation: outcome.escalation,
  };
}

/** A template's `VARIABLES.json`, which the blocks can show only as texts and images; a string explains a refusal. */
async function readContract(ctx: BlocksContext): Promise<StoryboardFormat["variables"] | string> {
  const path = join(videoDir(ctx), "VARIABLES.json");
  if (!(await exists(path))) return null;
  let parsed;
  try {
    parsed = compositionVariablesSchema.safeParse(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    return `VARIABLES.json illisible : ${error instanceof Error ? error.message : String(error)}`;
  }
  if (!parsed.success) return `VARIABLES.json invalide : ${parsed.error.issues.map((issue) => issue.message).join(" ; ")}`;
  const unbindable = parsed.data.filter((variable) => !BINDABLE_VARIABLE_TYPES.includes(variable.type));
  if (unbindable.length)
    return `Le moteur blocs ne montre que des variables texte ou image (type string) : ${unbindable.map((variable) => `${variable.id} (${variable.type})`).join(", ")}. Retire-les ou change leur type dans les variables du template.`;
  return parsed.data;
}

/**
 * A step of the blocks engine. A comment on the storyboard or on the build rewrites STORYBOARD.json with the model
 * (never the HTML), and a build comment then assembles again.
 */
export async function runBlocksStep(ctx: BlocksContext): Promise<BlocksStepResult> {
  if (ctx.step === "brief") return briefStep(ctx);
  if (ctx.step === "variables") return variablesStep(ctx);
  const { manifests, blocks } = await loadBlocks(ctx.workspaceDir);
  const contract = await readContract(ctx);
  if (typeof contract === "string") return { ok: false, resultText: contract };
  if (contract) ctx = { ...ctx, format: { ...ctx.format, variables: contract } };
  if (ctx.step === "storyboard") {
    const current = ctx.feedback ? (await readStoryboard(ctx, manifests)).storyboard : null;
    return storyboardStep(ctx, manifests, current);
  }
  if (ctx.step === "media") return mediaStep(ctx, manifests);
  if (ctx.step === "build") {
    let usage: TokenUsage | undefined;
    let escalation: Escalation | undefined;
    let staleVoice = false;
    // An image has no storyboard step: its build writes STORYBOARD.json first.
    const missing = !(await exists(join(videoDir(ctx), "STORYBOARD.json")));
    if (ctx.feedback || missing) {
      const current = missing ? null : (await readStoryboard(ctx, manifests)).storyboard;
      const rewritten = await storyboardStep(ctx, manifests, current);
      if (!rewritten.ok) return rewritten;
      usage = rewritten.usage;
      escalation = rewritten.escalation;
      const after = (await readStoryboard(ctx, manifests)).storyboard;
      const spoken = (storyboard: Storyboard | null) => JSON.stringify(storyboard?.scenes.map((scene) => scene.voiceover) ?? []);
      staleVoice = spoken(current) !== spoken(after) && (await exists(join(videoDir(ctx), "audio_meta.json")));
    }
    const built = await buildStep(ctx, manifests, blocks);
    const warning = staleVoice ? "\nLa voix off a changé dans le storyboard : relance l'étape médias pour réenregistrer la voix." : "";
    return { ...built, resultText: `${built.resultText ?? ""}${warning}`, usage: addUsage(usage, built.usage), escalation: mergeEscalation(escalation, built.escalation) };
  }
  return { ok: false, resultText: `Le moteur blocs ne gère pas l'étape « ${ctx.step} ».` };
}
