import { blockPreviewHtml, loadBlocks, type BlockManifest } from "@studio/shared";

export type BlockCard = { manifest: BlockManifest; preview: string };

/** The workspace's blocks, scenes first, each with its preview page (9:16, the format most blocks are made for). */
export async function listBlocks(workspaceDir: string): Promise<BlockCard[]> {
  const { manifests, blocks } = await loadBlocks(workspaceDir);
  return manifests
    .map((manifest) => ({ manifest, preview: blockPreviewHtml(blocks.get(manifest.id)!) }))
    .sort((a, b) => Number(a.manifest.kind === "overlay") - Number(b.manifest.kind === "overlay"));
}
