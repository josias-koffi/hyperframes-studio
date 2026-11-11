import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { blockManifestSchema, type BlockManifest, type LoadedBlock } from "./storyboard";
import { USER_BLOCKS_DIR } from "./template-block";

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function readBlocksDir(root: string, label: string): Promise<LoadedBlock[]> {
  const found: LoadedBlock[] = [];
  for (const entry of (await readdir(root).catch(() => [])).sort()) {
    const dir = join(root, entry);
    if (!(await exists(join(dir, "block.json")))) continue;
    const manifest = blockManifestSchema.parse(JSON.parse(await readFile(join(dir, "block.json"), "utf8")));
    if (manifest.id !== entry) throw new Error(`${label}/${entry}/block.json : l'id « ${manifest.id} » doit être le nom du dossier`);
    found.push({ manifest, html: await readFile(join(dir, "block.html"), "utf8") });
  }
  return found;
}

/**
 * The blocks of the workspace: the app's (`blocks/`, synced from its skeleton on start), then the user's
 * (`blocks-user/`, made from their templates, never touched by the sync). Two blocks with one id are an error.
 */
export async function loadBlocks(workspaceDir: string): Promise<{ manifests: BlockManifest[]; blocks: Map<string, LoadedBlock> }> {
  const shipped = await readBlocksDir(join(workspaceDir, "blocks"), "blocks");
  if (shipped.length === 0) throw new Error(`aucun bloc dans ${join(workspaceDir, "blocks")}`);
  const own = await readBlocksDir(join(workspaceDir, USER_BLOCKS_DIR), USER_BLOCKS_DIR);
  const blocks = new Map<string, LoadedBlock>();
  for (const block of [...shipped, ...own]) {
    if (blocks.has(block.manifest.id)) throw new Error(`deux blocs portent l'id « ${block.manifest.id} »`);
    blocks.set(block.manifest.id, block);
  }
  return { manifests: [...blocks.values()].map((block) => block.manifest), blocks };
}

/** Writes a block made from a template into `blocks-user/<id>/`; an id the workspace already has is refused. */
export async function saveUserBlock(workspaceDir: string, block: LoadedBlock): Promise<void> {
  const { blocks } = await loadBlocks(workspaceDir);
  if (blocks.has(block.manifest.id)) throw new Error(`un bloc porte déjà l'id « ${block.manifest.id} »`);
  const dir = join(workspaceDir, USER_BLOCKS_DIR, block.manifest.id);
  await mkdir(dir, { recursive: true });
  try {
    await writeFile(join(dir, "block.json"), `${JSON.stringify(block.manifest, null, 2)}\n`);
    await writeFile(join(dir, "block.html"), block.html);
  } catch (error) {
    await rm(dir, { recursive: true, force: true });
    throw error;
  }
}
