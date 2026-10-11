import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { assembleVideo, parseStoryboard, type StudioEvent } from "@studio/shared";
import { describe, expect, it } from "vitest";
import { availableAssets, loadBlocks, writeStoryboard, type BlocksContext } from "./blocks";
import { blocksModelFor } from "./process-job";

/** The workspace skeleton shipped with the app, whose blocks are tested as they are. */
const SKELETON = resolve(__dirname, "../../../workspace");

function context(fetchImpl: typeof fetch, events: StudioEvent[] = []): BlocksContext {
  return {
    workspaceDir: SKELETON,
    slug: "essai",
    step: "storyboard",
    format: { width: 1080, height: 1920, durationSeconds: 15 },
    campaign: "Framesmith",
    model: "deepseek/deepseek-v4",
    openrouter: { baseUrl: "http://proxy.test/api/v1", token: "sk-studio-test" },
    env: {},
    timeoutMs: 60_000,
    onEvent: (event) => void events.push(event),
    fetchImpl,
  };
}

const answer = (content: unknown, status = 200) =>
  new Response(
    status === 200 ? JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }], usage: { prompt_tokens: 100, completion_tokens: 50 } }) : "bad request",
    { status, headers: { "content-type": "application/json" } },
  );

const valid = {
  version: 1,
  title: "Pub",
  audio: { voice: false, music: null },
  scenes: [
    { id: "s1", title: "Accroche", block: "hook-kinetic", duration: 3, props: { text: "Tu perds du temps ?" }, voiceover: "", transition: "cut" },
    { id: "s2", title: "Idée", block: "title-subtitle", duration: 6, props: { title: "Tes vidéos en 5 min" }, voiceover: "", transition: "fade" },
    { id: "s3", title: "Fin", block: "cta-end", duration: 4, props: { headline: "Essaie-le", action: "Télécharger" }, voiceover: "", transition: "fade" },
  ],
};

describe("the shipped blocks", () => {
  it("load, and every placeholder of every block fills", async () => {
    const { manifests, blocks } = await loadBlocks(SKELETON);
    expect(manifests.map((manifest) => manifest.id)).toEqual(["cta-end", "hook-kinetic", "media-fullframe", "title-subtitle"]);
    const scenes = [
      { id: "s1", title: "A", block: "hook-kinetic", duration: 2.5, props: { text: "Bonjour", highlight: "à toi" } },
      { id: "s2", title: "B", block: "title-subtitle", duration: 4, props: { kicker: "Étape 1", title: "Titre", subtitle: "Phrase" } },
      { id: "s3", title: "C", block: "media-fullframe", duration: 4, props: { src: "assets/uploads/p.png", motion: "pan-left", caption: "Légende" } },
      { id: "s4", title: "D", block: "cta-end", duration: 3, props: { headline: "Fin", action: "Go", link: "site.fr" } },
    ];
    const { storyboard, errors } = parseStoryboard(JSON.stringify({ version: 1, title: "T", audio: { voice: false, music: null }, scenes }), manifests, {
      width: 1080,
      height: 1920,
    });
    expect(errors).toEqual([]);
    const out = assembleVideo({ storyboard: storyboard!, blocks, width: 1080, height: 1920 });
    for (const html of Object.values(out.files)) {
      expect(html).not.toMatch(/\{\{/);
      expect(html).toContain("<template>");
    }
    expect(out.files["compositions/scenes/s3.html"]).toContain('src="assets/uploads/p.png"');
    expect(out.files["compositions/scenes/s3.html"]).toContain('const motion = "pan-left";');
  });
});

describe("writeStoryboard", () => {
  it("answers the model with the errors until the storyboard passes", async () => {
    const bodies: { messages: { role: string; content: string }[]; response_format: { type: string } }[] = [];
    const replies = [answer({ ...valid, scenes: [{ ...valid.scenes[0], props: { text: "x".repeat(80) } }, ...valid.scenes.slice(1)] }), answer(valid)];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return replies.shift()!;
    }) as unknown as typeof fetch;
    const { manifests } = await loadBlocks(SKELETON);
    const result = await writeStoryboard(context(fetchImpl), { manifests, brief: "# Brief", assets: [] });
    expect(result.errors).toEqual([]);
    expect(result.storyboard?.scenes).toHaveLength(3);
    expect(result.usage).toEqual({ inputTokens: 200, outputTokens: 100, cacheReadTokens: 0, cacheCreationTokens: 0 });
    expect(bodies).toHaveLength(2);
    expect(bodies[0].response_format.type).toBe("json_schema");
    expect(bodies[0].messages[0].content).toContain("### hook-kinetic");
    expect(bodies[1].messages.at(-1)?.content).toMatch(/80 caractères, 48 au plus/);
  });

  it("falls back to json_object when the model refuses json_schema", async () => {
    const types: string[] = [];
    const replies = [answer(null, 400), answer(valid)];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      types.push(JSON.parse(String(init.body)).response_format.type);
      return replies.shift()!;
    }) as unknown as typeof fetch;
    const { manifests } = await loadBlocks(SKELETON);
    const result = await writeStoryboard(context(fetchImpl), { manifests, brief: "# Brief", assets: [] });
    expect(types).toEqual(["json_schema", "json_object"]);
    expect(result.storyboard).not.toBeNull();
  });

  it("refuses an image that is not among the uploaded files", async () => {
    const withImage = {
      ...valid,
      scenes: [valid.scenes[0], { id: "s2", title: "Produit", block: "media-fullframe", duration: 6, props: { src: "assets/uploads/invente.png" }, voiceover: "", transition: "cut" }, valid.scenes[2]],
    };
    const fetchImpl = (async () => answer(withImage)) as unknown as typeof fetch;
    const { manifests } = await loadBlocks(SKELETON);
    const result = await writeStoryboard(context(fetchImpl), { manifests, brief: "# Brief", assets: ["assets/uploads/vrai.png"] });
    expect(result.storyboard).toBeNull();
    expect(result.errors.join("\n")).toMatch(/invente\.png » n'est pas dans les fichiers disponibles/);
  });
});

describe("availableAssets", () => {
  it("lists the images under assets/, not the studio's audio", async () => {
    const dir = await mkdtemp(join(tmpdir(), "blocks-assets-"));
    await mkdir(join(dir, "assets/uploads"), { recursive: true });
    await mkdir(join(dir, "assets/audio/voice"), { recursive: true });
    await writeFile(join(dir, "assets/uploads/logo.png"), "");
    await writeFile(join(dir, "assets/uploads/notes.txt"), "");
    await writeFile(join(dir, "assets/audio/voice/01.png"), "");
    expect(await availableAssets(dir)).toEqual(["assets/uploads/logo.png"]);
  });
});

describe("blocksModelFor", () => {
  const base = { jobId: "00000000-0000-4000-8000-000000000000", creationId: "00000000-0000-4000-8000-000000000001", slug: "essai", step: "storyboard" as const };
  it("uses the step model of an OpenCode job, else BLOCKS_MODEL", () => {
    expect(blocksModelFor({ ...base, ai: { backend: "opencode", models: { storyboard: "deepseek/deepseek-v4" }, media: {} } }, { blocksModel: "x/y" })).toBe("deepseek/deepseek-v4");
    expect(blocksModelFor({ ...base, ai: { backend: "claude-code", models: { storyboard: "opus" }, media: {} } }, { blocksModel: "x/y" })).toBe("x/y");
    expect(blocksModelFor(base, { blocksModel: null })).toBeNull();
  });
});
