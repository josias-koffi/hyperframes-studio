import { spawn } from "node:child_process";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  assembleVideo,
  blockManifestSchema,
  blocksCatalog,
  parseStoryboard,
  renderScriptMd,
  renderStoryboardHtml,
  renderStoryboardMd,
  sceneMidpoints,
  storyboardJsonSchema,
  type AudioMeta,
  type BlockManifest,
  type GenerationStep,
  type LoadedBlock,
  type StoryboardFormat,
  type Storyboard,
  type StudioEvent,
  type TokenUsage,
} from "@studio/shared";

/** What a blocks step hands back to `processClaudeJob`, in the shape of an agent turn. */
export type BlocksStepResult = { ok: boolean; resultText: string | null; usage?: TokenUsage };

export type BlocksContext = {
  workspaceDir: string;
  slug: string;
  step: GenerationStep;
  format: StoryboardFormat;
  /** Campaign name and context, shared by the créations of the project. */
  campaign: string;
  feedback?: string;
  /** OpenRouter id of the model writing STORYBOARD.json; only the storyboard and the comments need one. */
  model: string | null;
  /** The job's proxy token: the call is billed to the job like the voice and the music. */
  openrouter: { baseUrl: string; token: string } | null;
  /** Environment of the workspace scripts (`audio.mjs`, the HyperFrames CLI). */
  env: Record<string, string>;
  timeoutMs: number;
  onEvent: (event: StudioEvent) => Promise<void> | void;
  fetchImpl?: typeof fetch;
};

/** Answers the model may give before one passes the schema and the block rules. */
export const STORYBOARD_ATTEMPTS = 3;

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
  return [
    "Tu es le réalisateur d'un studio de vidéos courtes (publicités, TikTok, Reels). Tu écris le storyboard d'une vidéo en choisissant des blocs dans un catalogue et en remplissant leurs props.",
    "Tu réponds uniquement par un objet JSON conforme au schéma, sans texte autour.",
    "",
    "Règles :",
    "- Une idée par scène. Une vidéo courte commence par une accroche (hook-kinetic) et finit par un appel à l'action (cta-end).",
    "- Respecte la longueur maximale de chaque texte : un texte trop long est refusé. Écris court, concret, en français naturel, sans emoji.",
    "- La durée d'une scène suit son texte : environ 2,5 mots lus par seconde, sans sortir des bornes du bloc.",
    format.durationSeconds ? `- La somme des durées vise ${format.durationSeconds} s.` : "- Garde la vidéo sous 45 s.",
    "- Une image ne peut venir que de la liste des fichiers disponibles. Sans fichier adapté, n'utilise pas de bloc d'image.",
    "- Garde une identité visuelle commune : mêmes couleurs d'accent et de texte d'une scène à l'autre, sauf raison claire. Les couleurs s'écrivent #RRGGBB.",
    "- Voix off : si `audio.voice` vaut true, chaque scène a une phrase parlée (`voiceover`) qui complète l'écran au lieu de le répéter mot pour mot ; sinon tous les `voiceover` sont vides.",
    "- `audio.music` est une description en anglais de la musique (ambiance, tempo, instrumental, sans voix), ou null. Pas de musique sans voix off pour l'instant.",
    "- Les ids de scène vont de s1 à sN dans l'ordre. `transition` vaut cut, fade ou slide-up ; la première scène est en cut.",
    "",
    `Cadre : ${format.width}×${format.height} px.`,
    "",
    "## Catalogue des blocs",
    "",
    blocksCatalog(manifests, format),
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

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

async function chat(
  ctx: BlocksContext,
  messages: ChatMessage[],
  schema: Record<string, unknown>,
  jsonSchema: boolean,
): Promise<{ ok: true; content: string; usage?: TokenUsage } | { ok: false; status: number; error: string }> {
  const fetchImpl = ctx.fetchImpl ?? fetch;
  const response = await fetchImpl(`${ctx.openrouter!.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${ctx.openrouter!.token}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: ctx.model,
      messages,
      temperature: 0.5,
      response_format: jsonSchema ? { type: "json_schema", json_schema: { name: "storyboard", strict: false, schema } } : { type: "json_object" },
      usage: { include: true },
    }),
    signal: AbortSignal.timeout(Math.min(ctx.timeoutMs, 5 * 60 * 1000)),
  });
  const text = await response.text();
  if (!response.ok) return { ok: false, status: response.status, error: text.slice(0, 1000) };
  const body = JSON.parse(text) as {
    choices?: { message?: { content?: string | null } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    error?: { message?: string };
  };
  const content = body.choices?.[0]?.message?.content;
  if (!content) return { ok: false, status: 502, error: body.error?.message ?? "réponse vide du modèle" };
  const usage = body.usage
    ? { inputTokens: body.usage.prompt_tokens ?? 0, outputTokens: body.usage.completion_tokens ?? 0, cacheReadTokens: 0, cacheCreationTokens: 0 }
    : undefined;
  return { ok: true, content, usage };
}

const addUsage = (a: TokenUsage | undefined, b: TokenUsage | undefined): TokenUsage | undefined =>
  !a ? b : !b ? a : { inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens, cacheReadTokens: 0, cacheCreationTokens: 0 };

/**
 * One structured call, answered again with the errors until the storyboard passes (`STORYBOARD_ATTEMPTS`). A model
 * that refuses `json_schema` is asked once more with `json_object`: the zod schema has the last word either way.
 */
export async function writeStoryboard(
  ctx: BlocksContext,
  input: { manifests: readonly BlockManifest[]; brief: string; assets: readonly string[]; current?: Storyboard | null },
): Promise<{ storyboard: Storyboard | null; warnings: string[]; errors: string[]; usage?: TokenUsage }> {
  const schema = storyboardJsonSchema(input.manifests);
  const messages: ChatMessage[] = [
    { role: "system", content: storyboardSystemPrompt(input.manifests, ctx.format) },
    { role: "user", content: storyboardUserPrompt({ campaign: ctx.campaign, brief: input.brief, assets: input.assets, current: input.current, feedback: ctx.feedback }) },
  ];
  let jsonSchema = true;
  let usage: TokenUsage | undefined;
  let errors: string[] = [];
  for (let attempt = 1; attempt <= STORYBOARD_ATTEMPTS; attempt++) {
    let answer = await chat(ctx, messages, schema, jsonSchema);
    if (!answer.ok && jsonSchema && answer.status >= 400 && answer.status < 500) {
      await ctx.onEvent({ kind: "log", level: "info", text: `Le modèle refuse json_schema (HTTP ${answer.status}) : nouvel essai en json_object.` });
      jsonSchema = false;
      answer = await chat(ctx, messages, schema, jsonSchema);
    }
    if (!answer.ok) return { storyboard: null, warnings: [], errors: [`Appel du modèle refusé (HTTP ${answer.status}) : ${answer.error}`], usage };
    usage = addUsage(usage, answer.usage);
    const parsed = parseStoryboard(answer.content, input.manifests, ctx.format);
    const missing = parsed.storyboard ? await missingImages(ctx, parsed.storyboard, input.manifests, input.assets) : [];
    errors = [...parsed.errors, ...missing];
    if (parsed.storyboard && errors.length === 0) return { storyboard: parsed.storyboard, warnings: parsed.warnings, errors: [], usage };
    await ctx.onEvent({ kind: "log", level: "info", text: `Storyboard refusé (essai ${attempt}/${STORYBOARD_ATTEMPTS}) :\n- ${errors.join("\n- ")}` });
    messages.push(
      { role: "assistant", content: answer.content },
      { role: "user", content: `Ce storyboard est refusé :\n- ${errors.join("\n- ")}\n\nCorrige ces points et renvoie le storyboard complet, en JSON seulement.` },
    );
  }
  return { storyboard: null, warnings: [], errors, usage };
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
  await writeFile(join(dir, "SCRIPT.md"), renderScriptMd(storyboard));
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

async function storyboardStep(ctx: BlocksContext, manifests: BlockManifest[], current: Storyboard | null): Promise<BlocksStepResult> {
  if (!ctx.model) return { ok: false, resultText: "Aucun modèle OpenRouter pour le moteur blocs : choisis OpenCode dans les réglages IA, ou renseigne BLOCKS_MODEL." };
  if (!ctx.openrouter) return { ok: false, resultText: "Clé OpenRouter absente : le moteur blocs ne peut pas appeler le modèle." };
  const dir = videoDir(ctx);
  const briefPath = join(dir, "BRIEF.md");
  if (!(await exists(briefPath))) return { ok: false, resultText: "BRIEF.md absent : relance l'étape brief." };
  const result = await writeStoryboard(ctx, {
    manifests,
    brief: await readFile(briefPath, "utf8"),
    assets: await availableAssets(dir),
    current,
  });
  if (!result.storyboard)
    return { ok: false, resultText: `Storyboard refusé après ${STORYBOARD_ATTEMPTS} essais :\n- ${result.errors.join("\n- ")}`, usage: result.usage };
  await saveStoryboard(ctx, result.storyboard, manifests, result.warnings);
  const { storyboard } = result;
  const total = storyboard.scenes.reduce((sum, scene) => sum + scene.duration, 0);
  const lines = storyboard.scenes.map((scene, index) => `${index + 1}. ${scene.title} (${scene.block}, ${scene.duration} s)`);
  return { ok: true, resultText: [`${storyboard.scenes.length} scènes, environ ${total.toFixed(1)} s.`, ...lines, ...result.warnings].join("\n"), usage: result.usage };
}

async function mediaStep(ctx: BlocksContext, manifests: BlockManifest[]): Promise<BlocksStepResult> {
  const { storyboard, errors } = await readStoryboard(ctx, manifests);
  if (!storyboard) return { ok: false, resultText: errors.join("\n") };
  if (!storyboard.audio.voice) return { ok: true, resultText: "Pas de voix off : aucun média à produire." };
  const args = ["scripts/audio.mjs", `videos/${ctx.slug}`];
  if (storyboard.audio.music) args.push("--music", storyboard.audio.music);
  const run = await runCommand(ctx, "node", args, ctx.timeoutMs);
  if (run.code !== 0) return { ok: false, resultText: `scripts/audio.mjs a échoué (code ${run.code}) :\n${tail(run.output)}` };
  return { ok: true, resultText: "Voix off et musique en place (audio_meta.json)." };
}

async function buildStep(ctx: BlocksContext, manifests: BlockManifest[], blocks: Map<string, LoadedBlock>): Promise<BlocksStepResult> {
  const dir = videoDir(ctx);
  const { storyboard, errors } = await readStoryboard(ctx, manifests);
  if (!storyboard) return { ok: false, resultText: errors.join("\n") };
  const metaPath = join(dir, "audio_meta.json");
  const audio = (await exists(metaPath)) ? (JSON.parse(await readFile(metaPath, "utf8")) as AudioMeta) : null;
  const assembled = assembleVideo({ storyboard, blocks, width: ctx.format.width, height: ctx.format.height, audio });
  // The scenes are regenerated from STORYBOARD.json: a scene removed from the storyboard must not linger.
  await rm(join(dir, "compositions", "scenes"), { recursive: true, force: true });
  await writeFile(join(dir, "index.html"), assembled.indexHtml);
  for (const [path, html] of Object.entries(assembled.files)) {
    await mkdir(dirname(join(dir, path)), { recursive: true });
    await writeFile(join(dir, path), html);
  }
  await ctx.onEvent({ kind: "log", level: "info", text: `Composition assemblée : ${storyboard.scenes.length} scènes, ${assembled.duration} s.` });

  const check = await runCommand(ctx, "npm", ["run", "check", "--", `videos/${ctx.slug}`], ctx.timeoutMs);
  if (check.code !== 0) return { ok: false, resultText: `Le check HyperFrames a échoué sur la composition assemblée :\n${tail(check.output)}` };
  const cli = await pinnedHyperframes(ctx.workspaceDir);
  const at = sceneMidpoints(assembled.timings).join(",");
  const snapshot = await runCommand(ctx, "npx", ["--yes", cli, "snapshot", `videos/${ctx.slug}`, "--at", at], ctx.timeoutMs);
  if (snapshot.code !== 0) await ctx.onEvent({ kind: "log", level: "error", text: `Snapshots impossibles (code ${snapshot.code}) : la planche de relecture manque.` });
  return { ok: true, resultText: `Check passé. ${storyboard.scenes.length} scènes, ${assembled.duration} s.` };
}

/**
 * A step of the blocks engine. A comment on the storyboard or on the build rewrites STORYBOARD.json with the model
 * (never the HTML), and a build comment then assembles again.
 */
export async function runBlocksStep(ctx: BlocksContext): Promise<BlocksStepResult> {
  const { manifests, blocks } = await loadBlocks(ctx.workspaceDir);
  if (ctx.step === "storyboard") {
    const current = ctx.feedback ? (await readStoryboard(ctx, manifests)).storyboard : null;
    return storyboardStep(ctx, manifests, current);
  }
  if (ctx.step === "media") return mediaStep(ctx, manifests);
  if (ctx.step === "build") {
    let usage: TokenUsage | undefined;
    let staleVoice = false;
    if (ctx.feedback) {
      const current = (await readStoryboard(ctx, manifests)).storyboard;
      const rewritten = await storyboardStep(ctx, manifests, current);
      if (!rewritten.ok) return rewritten;
      usage = rewritten.usage;
      const after = (await readStoryboard(ctx, manifests)).storyboard;
      const spoken = (storyboard: Storyboard | null) => JSON.stringify(storyboard?.scenes.map((scene) => scene.voiceover) ?? []);
      staleVoice = spoken(current) !== spoken(after) && (await exists(join(videoDir(ctx), "audio_meta.json")));
    }
    const built = await buildStep(ctx, manifests, blocks);
    const warning = staleVoice ? "\nLa voix off a changé dans le storyboard : relance l'étape médias pour réenregistrer la voix." : "";
    return { ...built, resultText: `${built.resultText ?? ""}${warning}`, usage: addUsage(usage, built.usage) };
  }
  return { ok: false, resultText: `Le moteur blocs ne gère pas l'étape « ${ctx.step} ».` };
}
