import { execFile } from "node:child_process";
import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import {
  assembleVideo,
  compositionVariablesSchema,
  loadBlocks,
  saveUserBlock,
  templateSceneToBlock,
  type BlockManifest,
  storyboardSchema,
  type LoadedBlock,
} from "@studio/shared";

const run = promisify(execFile);

/** A scene of a template that can become a block: a sub-composition, or the whole root composition. */
export type TemplateScene = { path: string; label: string; duration: number };

export const makeBlockSchema = z.object({
  scene: z.string().min(1),
  id: z.string().regex(/^[a-z][a-z0-9-]{1,40}$/, "minuscules, chiffres et tirets, 2 à 41 caractères"),
  name: z.string().trim().min(1).max(60),
  family: z.string().regex(/^[a-z][a-z0-9-]{1,40}$/).optional(),
  description: z.string().trim().min(1).max(300),
  useWhen: z.string().trim().min(1).max(300),
});
export type MakeBlockBody = z.infer<typeof makeBlockSchema>;

const attribute = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];

/** The scenes of a built template: each sub-composition of its root, then the root itself. */
export async function templateScenes(videoDir: string): Promise<TemplateScene[]> {
  const index = await readFile(join(videoDir, "index.html"), "utf8").catch(() => null);
  if (index === null) return [];
  const scenes: TemplateScene[] = [];
  for (const [tag] of index.matchAll(/<[a-z]+\b[^>]*\bdata-composition-src="[^"]+"[^>]*>/g)) {
    const path = attribute(tag, "data-composition-src")!;
    if (scenes.some((scene) => scene.path === path)) continue;
    scenes.push({ path, label: attribute(tag, "data-label") ?? path, duration: Number(attribute(tag, "data-duration")) || 3 });
  }
  const root = /<[a-z]+\b[^>]*\bdata-composition-id="main"[^>]*>/.exec(index)?.[0];
  scenes.push({ path: "index.html", label: "Toute la composition", duration: Number(root && attribute(root, "data-duration")) || 5 });
  return scenes;
}

/**
 * Checks a block the way a video uses it: one scene of it, with the template's example, assembled in a folder of the
 * workspace and passed through `hyperframes check`. Null when it passes, the end of the report otherwise.
 */
async function checkBlock(workspaceDir: string, templateDir: string, block: LoadedBlock): Promise<string | null> {
  const slug = `.block-check-${block.manifest.id}`;
  const dir = join(workspaceDir, "videos", slug);
  await rm(dir, { recursive: true, force: true });
  try {
    await mkdir(dir, { recursive: true });
    for (const file of ["hyperframes.json", "meta.json"]) await cp(join(templateDir, file), join(dir, file)).catch(() => undefined);
    // The example's images, where the template keeps them.
    for (const [key, prop] of Object.entries(block.manifest.props)) {
      const value = block.manifest.example?.[key];
      if (prop.type !== "image" || !value || /^(https?:|data:)/.test(value)) continue;
      const source = join(templateDir, value);
      if (!(await stat(source).catch(() => null))) continue;
      await mkdir(dirname(join(dir, value)), { recursive: true });
      await cp(source, join(dir, value));
    }
    const storyboard = storyboardSchema.parse({
      version: 1,
      title: block.manifest.name,
      audio: { voice: false, music: null },
      scenes: [{ id: "s1", title: block.manifest.name, block: block.manifest.id, duration: block.manifest.duration.default, props: block.manifest.example ?? {}, voiceover: "", transition: "cut" }],
      overlays: [],
    });
    const out = assembleVideo({ storyboard, blocks: new Map([[block.manifest.id, block]]), width: 1080, height: 1920 });
    await writeFile(join(dir, "index.html"), out.indexHtml);
    for (const [path, html] of Object.entries(out.files)) {
      await mkdir(dirname(join(dir, path)), { recursive: true });
      await writeFile(join(dir, path), html);
    }
    try {
      await run("npm", ["run", "check", "--", `videos/${slug}`], { cwd: workspaceDir, timeout: 180_000, maxBuffer: 8 * 1024 * 1024 });
      return null;
    } catch (error) {
      const failed = error as { stdout?: string; stderr?: string; message: string };
      return `${failed.stdout ?? ""}\n${failed.stderr ?? ""}`.trim().split("\n").slice(-25).join("\n") || failed.message;
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Makes a block of the blocks engine from a scene of a built template (BLK-003): its variables become the block's
 * props, its defaults the example. The block is saved in `blocks-user/` only once `check` passes on it.
 */
export async function blockFromTemplate(
  workspaceDir: string,
  videoDir: string,
  body: MakeBlockBody,
  { check = checkBlock }: { check?: typeof checkBlock } = {},
): Promise<{ manifest: BlockManifest } | { errors: string[] }> {
  const scenes = await templateScenes(videoDir);
  const scene = scenes.find((candidate) => candidate.path === body.scene);
  if (!scene) return { errors: [`scène introuvable dans index.html : ${body.scene}`] };
  const contract = await readFile(join(videoDir, "VARIABLES.json"), "utf8").catch(() => null);
  if (contract === null) return { errors: ["ce template n'a pas de VARIABLES.json validé"] };
  const variables = compositionVariablesSchema.parse(JSON.parse(contract));
  const html = await readFile(join(videoDir, scene.path), "utf8");
  const result = templateSceneToBlock({ html, variables, duration: scene.duration, ...body });
  if (!result.block) return { errors: result.errors };
  const { blocks } = await loadBlocks(workspaceDir);
  if (blocks.has(body.id)) return { errors: [`un bloc porte déjà l'id « ${body.id} »`] };
  const report = await check(workspaceDir, videoDir, result.block);
  if (report) return { errors: [`le bloc ne passe pas check :\n${report}`] };
  await saveUserBlock(workspaceDir, result.block);
  return { manifest: result.block.manifest };
}
