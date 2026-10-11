import { z } from "zod";
import { ASPECTS, aspectOf, type Aspect } from "./creations";
import { escapeHtml } from "./editor/html-tree";

/**
 * The blocks engine: the model only picks blocks and fills their props in `STORYBOARD.json`, validated here; the
 * composition is then assembled by code (`assembleVideo`). A block is a folder `workspace/blocks/<id>/` holding its
 * manifest (`block.json`, read by the model) and its sub-composition (`block.html`, a template with `{{prop}}`
 * placeholders).
 */

export const BLOCK_PROP_TYPES = ["text", "color", "image", "enum"] as const;
export type BlockPropType = (typeof BLOCK_PROP_TYPES)[number];

const propIdSchema = z.string().regex(/^[a-z][a-zA-Z0-9]{0,31}$/);
const slugIdSchema = z.string().regex(/^[a-z][a-z0-9-]{1,40}$/);

export const blockPropSchema = z.object({
  type: z.enum(BLOCK_PROP_TYPES),
  /** What the prop is, in French, for the model and the review. */
  label: z.string().min(1),
  required: z.boolean().default(true),
  /** Characters the layout can hold on screen; only for `text`. */
  maxLength: z.number().int().positive().optional(),
  /** Used when an optional prop is left out. */
  default: z.string().optional(),
  /** Allowed values of an `enum`. */
  options: z.array(z.string().min(1)).optional(),
});
export type BlockProp = z.infer<typeof blockPropSchema>;

export const blockManifestSchema = z.object({
  id: slugIdSchema,
  name: z.string().min(1),
  /** One sentence: what the block shows. */
  description: z.string().min(1),
  /** When the model should pick it. */
  useWhen: z.string().min(1),
  props: z.record(propIdSchema, blockPropSchema),
  /** Seconds a scene of this block may last. */
  duration: z.object({ min: z.number().positive(), max: z.number().positive(), default: z.number().positive() }),
  /** Frames the layout supports; every frame when absent. */
  aspects: z.array(z.enum(Object.keys(ASPECTS) as [Aspect, ...Aspect[]])).optional(),
  /** A scene fills the frame in turn; an overlay sits above the scenes it spans, on a transparent background. */
  kind: z.enum(["scene", "overlay"]).default("scene"),
  /** What the storyboard must have for the block to work: `voice` for captions that follow the spoken words. */
  requires: z.array(z.enum(["voice"])).default([]),
});
export type BlockManifest = z.infer<typeof blockManifestSchema>;

/** The scene a block cannot cover: an agent writes its sub-composition from `props.description`. */
export const CUSTOM_BLOCK = "custom";
/** Scenes written by an agent in one storyboard: each one costs a turn of a strong model. */
export const MAX_CUSTOM_SCENES = 2;
const CUSTOM_DESCRIPTION_MAX = 600;

/** How a scene comes in over the previous one. */
export const TRANSITIONS = ["cut", "fade", "slide-up"] as const;
export type Transition = (typeof TRANSITIONS)[number];

/** Seconds two scenes overlap when the second one comes in with a fade or a slide. */
export const TRANSITION_SECONDS = 0.5;
/** Silence kept after a scene's voice before the next scene. */
export const VOICE_TAIL_SECONDS = 0.4;

export const storyboardSceneSchema = z.object({
  id: z.string().regex(/^s[0-9]{1,2}$/),
  /** Short name of the scene, in French, shown in the review and the editor. */
  title: z.string().min(1).max(80),
  block: slugIdSchema,
  duration: z.number().positive().max(30),
  props: z.record(z.string(), z.string()),
  /** Spoken text of the scene, in the création's language; empty when nothing is said. */
  voiceover: z.string().max(400).default(""),
  transition: z.enum(TRANSITIONS).default("cut"),
});
export type StoryboardScene = z.infer<typeof storyboardSceneSchema>;

const sceneIdSchema = z.string().regex(/^s[0-9]{1,2}$/);

/** A block laid over the scenes from the start of `from` to the end of `to`: a lower third, the captions. */
export const storyboardOverlaySchema = z.object({
  id: z.string().regex(/^o[0-9]{1,2}$/),
  block: slugIdSchema,
  from: sceneIdSchema,
  to: sceneIdSchema,
  props: z.record(z.string(), z.string()),
});
export type StoryboardOverlay = z.infer<typeof storyboardOverlaySchema>;

export const storyboardSchema = z.object({
  version: z.literal(1),
  title: z.string().min(1).max(120),
  audio: z.object({
    voice: z.boolean(),
    /** English prompt of the music bed (mood, tempo, instrumental), or null for none. */
    music: z.string().max(300).nullable(),
  }),
  scenes: z.array(storyboardSceneSchema).min(1).max(20),
  overlays: z.array(storyboardOverlaySchema).max(8).default([]),
});
export type Storyboard = z.infer<typeof storyboardSchema>;

export type StoryboardFormat = { width: number; height: number; durationSeconds?: number | null };

const COLOR = /^#[0-9a-fA-F]{6}$/;

/** A path the composition can load: inside the création's `assets/`, without leaving it. */
export function isAssetPath(value: string): boolean {
  return /^assets\/[^\s"'<>\\]+$/.test(value) && !value.split("/").includes("..");
}

export type StoryboardCheck = { errors: string[]; warnings: string[] };

/**
 * What the schema cannot say: blocks that exist, props that fit them, a length close to the asked one. The errors
 * go back to the model, which answers again; the warnings are shown in the review.
 */
export function validateStoryboard(storyboard: Storyboard, manifests: readonly BlockManifest[], format: StoryboardFormat): StoryboardCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const byId = new Map(manifests.map((manifest) => [manifest.id, manifest]));
  const ofKind = (kind: BlockManifest["kind"]) => manifests.filter((manifest) => manifest.kind === kind).map((manifest) => manifest.id);
  const aspect = aspectOf(format.width, format.height);
  const seen = new Set<string>();

  if (storyboard.audio.voice && !storyboard.scenes.some((scene) => scene.voiceover.trim()))
    errors.push("audio.voice vaut true mais aucune scène n'a de `voiceover`.");
  if (!storyboard.audio.voice && storyboard.scenes.some((scene) => scene.voiceover.trim()))
    errors.push("audio.voice vaut false : laisse tous les `voiceover` vides, ou mets `voice` à true.");

  /** The rules every block shares: its frames, its props, what it needs from the storyboard. */
  const checkBlock = (where: string, manifest: BlockManifest, props: Record<string, string>) => {
    if (aspect && manifest.aspects && !manifest.aspects.includes(aspect))
      errors.push(`${where} : le bloc ${manifest.id} ne gère pas le cadre ${aspect}.`);
    if (manifest.requires.includes("voice") && !storyboard.audio.voice)
      errors.push(`${where} : le bloc ${manifest.id} suit la voix off, qui est absente (audio.voice vaut false).`);
    for (const key of Object.keys(props)) {
      if (!manifest.props[key]) errors.push(`${where} : prop « ${key} » inconnue du bloc ${manifest.id}.`);
    }
    for (const [key, prop] of Object.entries(manifest.props)) {
      const value = props[key];
      if (value === undefined || value.trim() === "") {
        if (prop.required && prop.default === undefined) errors.push(`${where} : prop obligatoire « ${key} » (${prop.label}) absente.`);
        continue;
      }
      if (prop.type === "text" && prop.maxLength && value.length > prop.maxLength)
        errors.push(`${where} : « ${key} » fait ${value.length} caractères, ${prop.maxLength} au plus. Raccourcis-le.`);
      if (prop.type === "color" && !COLOR.test(value)) errors.push(`${where} : « ${key} » doit être une couleur #RRGGBB.`);
      if (prop.type === "image" && !isAssetPath(value))
        errors.push(`${where} : « ${key} » doit être un chemin du dossier de la création, commençant par assets/.`);
      if (prop.type === "enum" && prop.options && !prop.options.includes(value))
        errors.push(`${where} : « ${key} » doit valoir ${prop.options.join(", ")}.`);
    }
  };

  let custom = 0;
  for (const scene of storyboard.scenes) {
    const where = `scène ${scene.id}`;
    if (seen.has(scene.id)) errors.push(`${where} : id en double.`);
    seen.add(scene.id);
    if (scene.block === CUSTOM_BLOCK) {
      custom++;
      const description = scene.props.description?.trim() ?? "";
      if (!description) errors.push(`${where} : une scène custom décrit ce qu'elle montre dans props.description.`);
      if (description.length > CUSTOM_DESCRIPTION_MAX)
        errors.push(`${where} : props.description fait ${description.length} caractères, ${CUSTOM_DESCRIPTION_MAX} au plus.`);
      const extra = Object.keys(scene.props).filter((key) => key !== "description");
      if (extra.length) errors.push(`${where} : une scène custom n'a que props.description (en trop : ${extra.join(", ")}).`);
      continue;
    }
    const manifest = byId.get(scene.block);
    if (!manifest || manifest.kind !== "scene") {
      const why = manifest ? `« ${scene.block} » est un calque, à placer dans overlays` : `bloc inconnu « ${scene.block} »`;
      errors.push(`${where} : ${why}. Blocs de scène : ${[...ofKind("scene"), CUSTOM_BLOCK].join(", ")}.`);
      continue;
    }
    if (scene.duration < manifest.duration.min || scene.duration > manifest.duration.max)
      errors.push(`${where} : durée ${scene.duration} s hors des bornes du bloc ${manifest.id} (${manifest.duration.min} à ${manifest.duration.max} s).`);
    checkBlock(where, manifest, scene.props);
  }
  if (custom > MAX_CUSTOM_SCENES) errors.push(`${custom} scènes custom : ${MAX_CUSTOM_SCENES} au plus, utilise les blocs du catalogue pour les autres.`);

  const order = new Map(storyboard.scenes.map((scene, index) => [scene.id, index]));
  const overlayIds = new Set<string>();
  for (const overlay of storyboard.overlays) {
    const where = `calque ${overlay.id}`;
    if (overlayIds.has(overlay.id)) errors.push(`${where} : id en double.`);
    overlayIds.add(overlay.id);
    const manifest = byId.get(overlay.block);
    if (!manifest || manifest.kind !== "overlay") {
      const why = manifest ? `« ${overlay.block} » est un bloc de scène, à placer dans scenes` : `bloc inconnu « ${overlay.block} »`;
      errors.push(`${where} : ${why}. Calques : ${ofKind("overlay").join(", ") || "aucun"}.`);
      continue;
    }
    const from = order.get(overlay.from);
    const to = order.get(overlay.to);
    if (from === undefined || to === undefined) errors.push(`${where} : from et to doivent être des ids de scène (${[...order.keys()].join(", ")}).`);
    else if (from > to) errors.push(`${where} : la scène from (${overlay.from}) vient après la scène to (${overlay.to}).`);
    checkBlock(where, manifest, overlay.props);
  }

  if (storyboard.scenes[0]?.transition !== "cut" && storyboard.scenes.length > 0)
    warnings.push("La première scène n'a rien avant elle : sa transition est ignorée.");
  const target = format.durationSeconds;
  if (target) {
    const total = storyboard.scenes.reduce((sum, scene) => sum + scene.duration, 0);
    if (total > target * 1.25 || total < target * 0.6)
      errors.push(`Durée totale ${total.toFixed(1)} s, loin des ${target} s demandées : vise entre ${(target * 0.8).toFixed(0)} et ${(target * 1.1).toFixed(0)} s.`);
  }
  return { errors, warnings };
}

/** Parses a model's answer: JSON (fenced or not), then schema, then `validateStoryboard`. */
export function parseStoryboard(
  text: string,
  manifests: readonly BlockManifest[],
  format: StoryboardFormat,
): { storyboard: Storyboard | null } & StoryboardCheck {
  const raw = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    return { storyboard: null, errors: [`Réponse qui n'est pas du JSON valide : ${error instanceof Error ? error.message : String(error)}`], warnings: [] };
  }
  const parsed = storyboardSchema.safeParse(json);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((issue) => `${issue.path.join(".") || "racine"} : ${issue.message}`);
    return { storyboard: null, errors, warnings: [] };
  }
  const check = validateStoryboard(parsed.data, manifests, format);
  return { storyboard: check.errors.length ? null : parsed.data, ...check };
}

/**
 * JSON schema handed to the model (`response_format`). Loose on props, whose rules depend on the block: the zod
 * schema and `validateStoryboard` have the last word.
 */
export function storyboardJsonSchema(manifests: readonly BlockManifest[]): Record<string, unknown> {
  const props = { type: "object", additionalProperties: { type: "string" } };
  return {
    type: "object",
    additionalProperties: false,
    required: ["version", "title", "audio", "scenes", "overlays"],
    properties: {
      version: { type: "integer", enum: [1] },
      title: { type: "string" },
      audio: {
        type: "object",
        additionalProperties: false,
        required: ["voice", "music"],
        properties: { voice: { type: "boolean" }, music: { type: ["string", "null"] } },
      },
      scenes: {
        type: "array",
        minItems: 1,
        maxItems: 20,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "title", "block", "duration", "props", "voiceover", "transition"],
          properties: {
            id: { type: "string", pattern: "^s[0-9]{1,2}$" },
            title: { type: "string" },
            block: { type: "string", enum: [...manifests.filter((manifest) => manifest.kind === "scene").map((manifest) => manifest.id), CUSTOM_BLOCK] },
            duration: { type: "number" },
            props,
            voiceover: { type: "string" },
            transition: { type: "string", enum: [...TRANSITIONS] },
          },
        },
      },
      overlays: {
        type: "array",
        maxItems: 8,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "block", "from", "to", "props"],
          properties: {
            id: { type: "string", pattern: "^o[0-9]{1,2}$" },
            block: { type: "string", enum: manifests.filter((manifest) => manifest.kind === "overlay").map((manifest) => manifest.id) },
            from: { type: "string", pattern: "^s[0-9]{1,2}$" },
            to: { type: "string", pattern: "^s[0-9]{1,2}$" },
            props,
          },
        },
      },
    },
  };
}

/** The catalogue as the model reads it: the scene blocks that fit the frame, the custom scene, then the overlays. */
export function blocksCatalog(manifests: readonly BlockManifest[], format: StoryboardFormat): string {
  const aspect = aspectOf(format.width, format.height);
  const fitting = manifests.filter((manifest) => !aspect || !manifest.aspects || manifest.aspects.includes(aspect));
  const custom = [
    `### ${CUSTOM_BLOCK} — Scène sur mesure`,
    "Une scène qu'aucun bloc ne sait montrer (un schéma précis, une animation propre au produit), écrite à part par un agent : plus lente et plus chère.",
    `Quand l'utiliser : seulement si aucun bloc ne convient, ${MAX_CUSTOM_SCENES} au plus par vidéo.`,
    "Durée : libre, 30 s au plus",
    "Props :",
    `  - description (text, obligatoire, ${CUSTOM_DESCRIPTION_MAX} caractères max) : ce que la scène montre et comment elle bouge, avec les textes exacts à afficher et les couleurs.`,
  ].join("\n");
  const overlays = fitting.filter((manifest) => manifest.kind === "overlay");
  return [
    "## Blocs de scène (scenes[].block)",
    "",
    ...fitting.filter((manifest) => manifest.kind === "scene").map((manifest) => `${catalogEntry(manifest)}\n`),
    custom,
    ...(overlays.length
      ? ["", "## Calques par-dessus les scènes (overlays[].block, de la scène from à la scène to)", "", overlays.map(catalogEntry).join("\n\n")]
      : []),
  ].join("\n");
}

function catalogEntry(manifest: BlockManifest): string {
  const props = Object.entries(manifest.props).map(([key, prop]) => {
    const rules = [
      prop.type,
      prop.required && prop.default === undefined ? "obligatoire" : "facultatif",
      prop.maxLength ? `${prop.maxLength} caractères max` : null,
      prop.options ? `valeurs : ${prop.options.join(" | ")}` : null,
      prop.default !== undefined ? `défaut : ${prop.default}` : null,
    ].filter(Boolean);
    return `  - ${key} (${rules.join(", ")}) : ${prop.label}`;
  });
  return [
    `### ${manifest.id} — ${manifest.name}`,
    manifest.description,
    `Quand l'utiliser : ${manifest.useWhen}`,
    manifest.kind === "overlay"
      ? "Durée : celle des scènes qu'il couvre"
      : `Durée : ${manifest.duration.min} à ${manifest.duration.max} s (${manifest.duration.default} s par défaut)`,
    ...(manifest.requires.includes("voice") ? ["Demande une voix off (audio.voice à true)."] : []),
    "Props :",
    ...props,
  ].join("\n");
}

/** `studio_audio:` of STORYBOARD.md, read by the runner to skip the media step. */
export function studioAudio(storyboard: Storyboard): "voix+musique" | "voix" | "musique" | "aucun" {
  const { voice, music } = storyboard.audio;
  if (voice && music) return "voix+musique";
  if (voice) return "voix";
  if (music) return "musique";
  return "aucun";
}

/** SCRIPT.md in the shape `scripts/audio.mjs` reads: a `## … (Frame N)` heading per scene, the text indented. */
export function renderScriptMd(storyboard: Storyboard): string {
  const parts = [`# Script — ${storyboard.title}`, ""];
  storyboard.scenes.forEach((scene, index) => {
    parts.push(`## ${scene.title} (Frame ${index + 1})`, "");
    if (scene.voiceover.trim()) parts.push(`    ${scene.voiceover.trim().replace(/\s*\n\s*/g, " ")}`, "");
    else parts.push("_(pas de voix)_", "");
  });
  return parts.join("\n");
}

const cell = (value: string) => value.replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");

/** STORYBOARD.md: a view of STORYBOARD.json for the review, with the frontmatter the studio reads. */
export function renderStoryboardMd(storyboard: Storyboard, manifests: readonly BlockManifest[], warnings: readonly string[] = []): string {
  const byId = new Map(manifests.map((manifest) => [manifest.id, manifest]));
  const total = storyboard.scenes.reduce((sum, scene) => sum + scene.duration, 0);
  const lines = [
    "---",
    `title: ${JSON.stringify(storyboard.title)}`,
    "engine: blocks",
    `studio_audio: ${studioAudio(storyboard)}`,
    "---",
    "",
    `# ${storyboard.title}`,
    "",
    `${storyboard.scenes.length} scènes, environ ${total.toFixed(1)} s. Source : \`STORYBOARD.json\` (ce fichier est généré).`,
    "",
    `Voix off : ${storyboard.audio.voice ? "oui" : "non"} · Musique : ${storyboard.audio.music ? cell(storyboard.audio.music) : "aucune"}`,
    "",
    "| # | Scène | Bloc | Durée | Contenu | Voix off |",
    "| --- | --- | --- | --- | --- | --- |",
    ...storyboard.scenes.map((scene, index) => {
      const content = Object.entries(scene.props)
        .map(([key, value]) => `${key} : ${value}`)
        .join(" · ");
      return `| ${index + 1} | ${cell(scene.title)} | ${blockName(byId, scene.block)} | ${scene.duration} s | ${cell(content)} | ${cell(scene.voiceover) || "—"} |`;
    }),
  ];
  if (storyboard.overlays.length)
    lines.push(
      "",
      "## Calques par-dessus",
      "",
      "| Calque | Bloc | Scènes | Contenu |",
      "| --- | --- | --- | --- |",
      ...storyboard.overlays.map((overlay) => {
        const content = Object.entries(overlay.props)
          .map(([key, value]) => `${key} : ${value}`)
          .join(" · ");
        return `| ${overlay.id} | ${blockName(byId, overlay.block)} | ${overlay.from} → ${overlay.to} | ${cell(content) || "—"} |`;
      }),
    );
  if (warnings.length) lines.push("", "## Points d'attention", "", ...warnings.map((warning) => `- ${warning}`));
  return `${lines.join("\n")}\n`;
}

const blockName = (byId: ReadonlyMap<string, BlockManifest>, id: string) => (id === CUSTOM_BLOCK ? "Scène sur mesure" : (byId.get(id)?.name ?? id));

/** storyboard.html: the scenes as a grid of cards, for the review. */
export function renderStoryboardHtml(storyboard: Storyboard, manifests: readonly BlockManifest[]): string {
  const byId = new Map(manifests.map((manifest) => [manifest.id, manifest]));
  const cards = storyboard.scenes
    .map((scene, index) => {
      const props = Object.entries(scene.props)
        .map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd>`)
        .join("");
      return `<article><header><span>${index + 1}</span><h2>${escapeHtml(scene.title)}</h2><em>${scene.duration} s</em></header><p class="block">${escapeHtml(blockName(byId, scene.block))}</p><dl>${props}</dl>${scene.voiceover ? `<blockquote>${escapeHtml(scene.voiceover)}</blockquote>` : ""}</article>`;
    })
    .concat(
      storyboard.overlays.map((overlay) => {
        const props = Object.entries(overlay.props)
          .map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd>`)
          .join("");
        return `<article class="overlay"><header><span>${escapeHtml(overlay.id)}</span><h2>${escapeHtml(blockName(byId, overlay.block))}</h2><em>${escapeHtml(`${overlay.from} → ${overlay.to}`)}</em></header><p class="block">Calque par-dessus les scènes</p><dl>${props}</dl></article>`;
      }),
    )
    .join("\n");
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(storyboard.title)}</title>
<style>
body{margin:0;padding:24px;font:15px/1.5 system-ui,sans-serif;background:#f6f5f2;color:#1c1b19}
h1{font-size:22px;margin:0 0 16px}
main{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(260px,1fr))}
article{background:#fff;border:1px solid #e3e0da;border-radius:10px;padding:16px}
header{display:flex;gap:8px;align-items:baseline}header span{font-weight:700;color:#8a857c}header h2{font-size:16px;margin:0;flex:1}
.block{margin:6px 0;color:#6b665e;font-size:13px}
dl{display:grid;grid-template-columns:auto 1fr;gap:2px 10px;margin:8px 0}dt{color:#8a857c;font-size:13px}dd{margin:0}
blockquote{margin:8px 0 0;padding-left:10px;border-left:3px solid #d9d4ca;color:#4a463f}
.overlay{border-style:dashed}
</style></head>
<body><h1>${escapeHtml(storyboard.title)}</h1><main>
${cards}
</main></body></html>
`;
}

/** Word-level timings written by `scripts/audio.mjs` (`audio_meta.json`), the parts the assembler reads. */
export type AudioMeta = {
  bgm?: { path: string; volume?: number; duration_s?: number };
  voices?: { frame: number; path: string; duration_s: number; words?: { text: string; start: number; end: number }[] }[];
};

/** A spoken word, in seconds from the start of the overlay that shows it (`{{@words}}`). */
export type BlockWord = { text: string; start: number; end: number };

export type LoadedBlock = { manifest: BlockManifest; html: string };

export type AssembledVideo = {
  /** Root composition, `index.html`. */
  indexHtml: string;
  /** Scene and overlay sub-compositions, keyed by their path in the création's folder. */
  files: Record<string, string>;
  /** Start and length of each scene, after the voice has stretched it. */
  timings: { id: string; start: number; duration: number }[];
  /** Length of each scene's sub-composition: its own, plus the transition into the next scene. */
  slots: Record<string, number>;
  duration: number;
};

/** Where the agent writes a custom scene: outside `compositions/scenes/`, which every build regenerates. */
export const customScenePath = (sceneId: string) => `compositions/custom/${sceneId}.html`;
export const sceneCompositionId = (sceneId: string) => `scene-${sceneId}`;

const r3 = (value: number) => Math.round(value * 1000) / 1000;

/**
 * Fills a block template: `{{prop}}` gets the scene's escaped value (or the prop's default), `{{@id}}` the
 * composition id, `{{@duration}}`, `{{@width}}` and `{{@height}}` the slot, `{{@words}}` the spoken words it covers
 * as a JSON array (`BlockWord`). An unknown placeholder is a block authoring error.
 */
export function fillBlock(
  block: LoadedBlock,
  values: Record<string, string>,
  slot: { id: string; duration: number; width: number; height: number; words?: readonly BlockWord[] },
): string {
  return block.html.replace(/\{\{\s*(@?[a-zA-Z][a-zA-Z0-9]*)\s*\}\}/g, (_, key: string) => {
    if (key === "@id") return slot.id;
    if (key === "@duration") return String(r3(slot.duration));
    if (key === "@width") return String(slot.width);
    if (key === "@height") return String(slot.height);
    // Inside a <script>: `<` escaped so a word can never close it.
    if (key === "@words") return JSON.stringify(slot.words ?? []).replace(/</g, "\\u003c");
    const prop = block.manifest.props[key];
    if (!prop) throw new Error(`bloc ${block.manifest.id} : placeholder inconnu {{${key}}}`);
    const value = values[key]?.trim() ? values[key] : (prop.default ?? "");
    return escapeHtml(value);
  });
}

/**
 * Builds the video from a validated storyboard: one sub-composition per scene (`compositions/scenes/<id>.html`,
 * the block filled with its values, so every text stays plain text in the editor), the overlays above them
 * (`compositions/overlays/<id>.html`), the voice of each scene at its start, the music bed under all of it, and the
 * transitions on the root timeline. A scene lasts at least as long as its voice. A custom scene is not built here:
 * the root points at `customScenePath`, written by an agent.
 */
export function assembleVideo({
  storyboard,
  blocks,
  width,
  height,
  audio,
  gsapSrc = "https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js",
}: {
  storyboard: Storyboard;
  blocks: ReadonlyMap<string, LoadedBlock>;
  width: number;
  height: number;
  audio?: AudioMeta | null;
  gsapSrc?: string;
}): AssembledVideo {
  const voices = new Map((audio?.voices ?? []).map((voice) => [voice.frame, voice]));
  const files: Record<string, string> = {};
  const slots: Record<string, number> = {};
  const timings: AssembledVideo["timings"] = [];
  let cursor = 0;
  storyboard.scenes.forEach((scene, index) => {
    const voice = voices.get(index + 1);
    const duration = r3(Math.max(scene.duration, voice ? voice.duration_s + VOICE_TAIL_SECONDS : 0));
    timings.push({ id: scene.id, start: r3(cursor), duration });
    cursor += duration;
  });
  const total = r3(cursor);

  const clips: string[] = [];
  const tweens: string[] = [];
  const half = TRANSITION_SECONDS / 2;
  storyboard.scenes.forEach((scene, index) => {
    const timing = timings[index];
    const next = storyboard.scenes[index + 1];
    const overlap = next && next.transition !== "cut" ? TRANSITION_SECONDS : 0;
    const slotDuration = r3(timing.duration + overlap);
    slots[scene.id] = slotDuration;
    const compId = sceneCompositionId(scene.id);
    let path = customScenePath(scene.id);
    if (scene.block !== CUSTOM_BLOCK) {
      const block = blocks.get(scene.block);
      if (!block) throw new Error(`scène ${scene.id} : bloc ${scene.block} introuvable`);
      path = `compositions/scenes/${scene.id}.html`;
      files[path] = fillBlock(block, scene.props, { id: compId, duration: slotDuration, width, height });
    }
    clips.push(
      `      <div id="el-${scene.id}" class="clip scene" data-composition-id="${compId}" data-composition-src="${path}" data-start="${timing.start}" data-duration="${slotDuration}" data-track-index="${index % 2}" data-width="${width}" data-height="${height}" data-label="${escapeHtml(`${index + 1}. ${scene.title}`)}"></div>`,
    );
    const voice = voices.get(index + 1);
    if (voice)
      clips.push(
        `      <audio id="el-${scene.id}-voice" src="${escapeHtml(voice.path)}" data-start="${timing.start}" data-duration="${r3(voice.duration_s)}" data-track-index="10" data-volume="1"></audio>`,
      );

    if (index === 0 || scene.transition === "cut") return;
    const previous = `#el-${storyboard.scenes[index - 1].id}`;
    const current = `#el-${scene.id}`;
    // A dip: the previous scene is gone before this one shows, so their texts never stack (check's content_overlap).
    if (scene.transition === "fade") {
      tweens.push(`tl.to("${previous}", { opacity: 0, duration: ${half}, ease: "power2.in" }, ${timing.start});`);
      tweens.push(`tl.fromTo("${current}", { opacity: 0 }, { opacity: 1, duration: ${half}, ease: "power2.out" }, ${r3(timing.start + half)});`);
    }
    if (scene.transition === "slide-up") {
      tweens.push(`tl.to("${previous}", { y: -${height}, duration: ${TRANSITION_SECONDS}, ease: "power3.inOut" }, ${timing.start});`);
      tweens.push(`tl.fromTo("${current}", { y: ${height} }, { y: 0, duration: ${TRANSITION_SECONDS}, ease: "power3.inOut" }, ${timing.start});`);
    }
  });

  const order = new Map(storyboard.scenes.map((scene, index) => [scene.id, index]));
  storyboard.overlays.forEach((overlay, index) => {
    const block = blocks.get(overlay.block);
    if (!block) throw new Error(`calque ${overlay.id} : bloc ${overlay.block} introuvable`);
    const from = order.get(overlay.from);
    const to = order.get(overlay.to);
    if (from === undefined || to === undefined) throw new Error(`calque ${overlay.id} : scènes ${overlay.from} → ${overlay.to} introuvables`);
    const start = timings[from].start;
    const duration = r3(timings[to].start + timings[to].duration - start);
    const words: BlockWord[] = [];
    for (let scene = from; scene <= to; scene++) {
      const offset = timings[scene].start - start;
      for (const word of voices.get(scene + 1)?.words ?? [])
        words.push({ text: word.text, start: r3(word.start + offset), end: r3(word.end + offset) });
    }
    const compId = `overlay-${overlay.id}`;
    const path = `compositions/overlays/${overlay.id}.html`;
    files[path] = fillBlock(block, overlay.props, { id: compId, duration, width, height, words });
    clips.push(
      `      <div id="el-${overlay.id}" class="clip overlay" data-composition-id="${compId}" data-composition-src="${path}" data-start="${start}" data-duration="${duration}" data-track-index="${20 + index}" data-width="${width}" data-height="${height}" data-label="${escapeHtml(block.manifest.name)}"></div>`,
    );
  });

  if (audio?.bgm)
    clips.push(
      `      <audio id="el-bgm" src="${escapeHtml(audio.bgm.path)}" data-start="0" data-duration="${total}" data-track-index="11" data-volume="${audio.bgm.volume ?? 0.18}" data-fade-out="1.5"></audio>`,
    );

  const indexHtml = `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${width}, height=${height}" />
    <script src="${gsapSrc}"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { margin: 0; width: ${width}px; height: ${height}px; overflow: hidden; background: #000; }
      #root { position: relative; width: 100%; height: 100%; overflow: hidden; background: #000; }
      .scene, .overlay { position: absolute; inset: 0; width: 100%; height: 100%; }
    </style>
  </head>
  <body>
    <!-- Assemblé par le moteur blocs depuis STORYBOARD.json : régénéré à chaque build. -->
    <div id="root" data-composition-id="main" data-start="0" data-duration="${total}" data-width="${width}" data-height="${height}">
${clips.join("\n")}
    </div>
    <script>
      const tl = gsap.timeline({ paused: true });
${tweens.map((tween) => `      ${tween}`).join("\n")}
      tl.to({}, { duration: ${total} }, 0);
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`;
  return { indexHtml, files, timings, slots, duration: total };
}

/** Midpoint of each scene, for the contact sheet of the review. */
export function sceneMidpoints(timings: AssembledVideo["timings"]): number[] {
  return timings.map((timing) => r3(timing.start + timing.duration / 2));
}
