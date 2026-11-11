import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { blockManifestSchema, type BlockManifest, type LoadedBlock } from "./storyboard";

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
