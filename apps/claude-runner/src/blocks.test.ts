import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { assembleVideo, fillBlock, parseStoryboard, type StudioEvent } from "@studio/shared";
import { describe, expect, it } from "vitest";
import { availableAssets, loadBlocks, runBlocksStep, writeStoryboard, type BlocksContext } from "./blocks";
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
  it("each have a valid example, and every placeholder of every block fills", async () => {
    const { manifests, blocks } = await loadBlocks(SKELETON);
    expect(manifests.map((manifest) => manifest.id)).toEqual([
      "before-after",
      "bullet-3",
      "captions-karaoke",
      "cta-end",
      "hook-kinetic",
      "logo-sting",
      "lower-third",
      "media-fullframe",
      "media-split",
      "quote",
      "stat-countup",
      "title-subtitle",
    ]);
    // Every scene block once with its example, the overlays over the scenes they accept.
    const scenes = manifests
      .filter((manifest) => manifest.kind === "scene")
      .map((manifest, index) => ({
        id: `s${index + 1}`,
        title: manifest.name,
        block: manifest.id,
        duration: manifest.duration.default,
        props: manifest.example ?? {},
        voiceover: "Une phrase.",
      }));
    const overlays = manifests
      .filter((manifest) => manifest.kind === "overlay")
      .map((manifest, index) => {
        const over = scenes.filter((scene) => !manifest.onlyOver || manifest.onlyOver.includes(scene.block));
        return { id: `o${index + 1}`, block: manifest.id, from: over[0].id, to: over.at(-1)!.id, props: manifest.example ?? {} };
      });
    for (const manifest of manifests) expect(manifest.example, `${manifest.id} sans exemple`).toBeDefined();
    const { storyboard, errors } = parseStoryboard(
      JSON.stringify({ version: 1, title: "T", audio: { voice: true, music: null }, scenes, overlays }),
      manifests,
      { width: 1080, height: 1920 },
    );
    expect(errors).toEqual([]);
    const out = assembleVideo({ storyboard: storyboard!, blocks, width: 1080, height: 1920 });
    expect(Object.keys(out.files)).toHaveLength(manifests.length);
    for (const [path, html] of Object.entries(out.files)) {
      expect(html, path).not.toMatch(/\{\{/);
      expect(html, path).toContain("<template>");
      expect(html, path).not.toContain("data-layer");
    }
    // The captions keep the bottom of every scene free; the name band, over one photo, keeps nothing.
    expect(out.safeBottoms).toEqual(Object.fromEntries(scenes.map((scene) => [scene.id, 576])));
    const media = scenes.find((scene) => scene.block === "media-fullframe")!;
    expect(out.files[`compositions/scenes/${media.id}.html`]).toContain("calc(576px + 32px)");
  });
});

describe("template variables on the shipped blocks", () => {
  it("bind to every text and image prop that allows it", async () => {
    const { blocks } = await loadBlocks(SKELETON);
    for (const { manifest, html } of blocks.values()) {
      const bindable = Object.entries(manifest.props).filter(([, prop]) => (prop.type === "text" || prop.type === "image") && prop.bindable);
      const variables = Object.fromEntries(bindable.map(([key]) => [key, `v_${key}`]));
      const filled = fillBlock({ manifest, html }, manifest.example ?? {}, { id: "x", duration: 3, width: 1080, height: 1920 }, variables);
      for (const [key, prop] of bindable) expect(filled, `${manifest.id}.${key}`).toContain(prop.type === "image" ? `data-var-src="v_${key}"` : `data-var-text="v_${key}"`);
    }
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
    // The shape of the answer is in the prompt too, for a model that refuses json_schema.
    expect(bodies[0].messages[0].content).toContain('"overlays":[{"id":"o1","block":"captions-karaoke"');
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

/**
 * A workspace with the shipped blocks and stand-ins for what the steps run: `scripts/audio.mjs`, `npm` (check) and
 * `npx` (snapshot) only write down how they were called.
 */
async function fakeWorkspace(storyboard: unknown, { checkFailures = 0 } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "blocks-steps-"));
  const bin = join(dir, "bin");
  const calls = join(dir, "calls.log");
  await symlink(join(SKELETON, "blocks"), join(dir, "blocks"));
  await mkdir(join(dir, "scripts"), { recursive: true });
  await mkdir(bin);
  await mkdir(join(dir, "videos/essai"), { recursive: true });
  await writeFile(join(dir, "package.json"), JSON.stringify({ scripts: { check: "npx --yes hyperframes@0.0.1 check" } }));
  await writeFile(join(dir, "scripts/audio.mjs"), `import { appendFileSync } from "node:fs";\nappendFileSync(${JSON.stringify(calls)}, "audio " + process.argv.slice(2).join(" ") + "\\n");\n`);
  for (const tool of ["npm", "npx"]) {
    await writeFile(join(bin, tool), `#!/bin/sh\necho "${tool} $*" >> ${JSON.stringify(calls)}\n`);
    await chmod(join(bin, tool), 0o755);
  }
  // `check` fails as many times as asked, with a finding the model must fix.
  const fails = join(dir, "fails");
  await writeFile(fails, String(checkFailures));
  await writeFile(
    join(bin, "npm"),
    `#!/bin/sh\necho "npm $*" >> ${JSON.stringify(calls)}\nn=$(cat ${JSON.stringify(fails)})\nif [ "$n" -gt 0 ]; then echo $((n-1)) > ${JSON.stringify(fails)}; echo "✗ text_overflow #scene-s1-title"; exit 1; fi\n`,
  );
  await writeFile(join(dir, "videos/essai/STORYBOARD.json"), JSON.stringify(storyboard));
  const ctx = (step: BlocksContext["step"], extra: Partial<BlocksContext> = {}): BlocksContext => ({
    ...context((async () => answer(null, 500)) as unknown as typeof fetch),
    workspaceDir: dir,
    step,
    env: { PATH: `${bin}:${process.env.PATH}` },
    ...extra,
  });
  return { dir, ctx, calls: async () => (await readFile(calls, "utf8").catch(() => "")).trim().split("\n").filter(Boolean) };
}

describe("runBlocksStep", () => {
  it("makes the music alone, as long as the storyboard, when there is no voice", async () => {
    const { ctx, calls } = await fakeWorkspace({ ...valid, audio: { voice: false, music: "warm lofi" } });
    const result = await runBlocksStep(ctx("media"));
    expect(result).toMatchObject({ ok: true, resultText: "Musique en place (audio_meta.json)." });
    expect(await calls()).toEqual(["audio videos/essai --music warm lofi --steps music,meta --duration 13"]);
  });

  it("refuses a template whose contract has variables the blocks cannot show, before any call", async () => {
    const { dir, ctx } = await fakeWorkspace(valid);
    await writeFile(join(dir, "videos/essai/VARIABLES.json"), JSON.stringify([{ id: "price", type: "number", label: "Prix", default: 29 }]));
    await writeFile(join(dir, "videos/essai/BRIEF.md"), "# Brief");
    const result = await runBlocksStep(ctx("storyboard"));
    expect(result).toMatchObject({ ok: false });
    expect(result.resultText).toMatch(/que des variables texte ou image \(type string\) : price \(number\)/);
  });

  it("writes an image's storyboard at its build, then lays its one slide inline", async () => {
    const { dir, ctx, calls } = await fakeWorkspace(valid);
    await rm(join(dir, "videos/essai/STORYBOARD.json"));
    await writeFile(join(dir, "videos/essai/BRIEF.md"), "# Brief");
    const bodies: { messages: { content: string }[] }[] = [];
    const image = { version: 1, title: "Visuel", audio: { voice: false, music: null }, scenes: [{ ...valid.scenes[1], id: "s1", duration: 1, transition: "cut" }], overlays: [] };
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return answer(image);
    }) as unknown as typeof fetch;
    const result = await runBlocksStep(ctx("build", { fetchImpl, format: { width: 1080, height: 1080, frames: 1 } }));
    expect(result).toMatchObject({ ok: true });
    expect(bodies[0].messages[0].content).toContain("Tu composes une image fixe");
    expect(bodies[0].messages[0].content).not.toContain("### captions-karaoke");
    const html = await readFile(join(dir, "videos/essai/index.html"), "utf8");
    expect(html).toContain('<section id="el-s1" class="clip slide" data-start="0" data-duration="1"');
    expect(await readFile(join(dir, "videos/essai/SCRIPT.md"), "utf8").catch(() => null)).toBeNull();
    expect(await calls()).toEqual(["npm run check -- videos/essai", "npx --yes hyperframes@0.0.1 snapshot videos/essai --at 0.5"]);
  });

  it("skips the media step of a silent video", async () => {
    const { ctx, calls } = await fakeWorkspace(valid);
    expect((await runBlocksStep(ctx("media"))).ok).toBe(true);
    expect(await calls()).toEqual([]);
  });

  it("has an agent write a custom scene once, then checks and snapshots the video", async () => {
    const withCustom = {
      ...valid,
      scenes: [valid.scenes[0], { id: "s2", title: "Schéma", block: "custom", duration: 6, props: { description: "Trois étapes reliées par une flèche." }, voiceover: "", transition: "cut" }, valid.scenes[2]],
    };
    const { dir, ctx, calls } = await fakeWorkspace(withCustom);
    const prompts: string[] = [];
    const customScene = async (prompt: string) => {
      prompts.push(prompt);
      await writeFile(join(dir, "videos/essai/compositions/custom/s2.html"), '<template><div id="root" data-composition-id="scene-s2"></div></template>');
      return { ok: true, resultText: "Un schéma.", costUsd: 0.12 };
    };
    const first = await runBlocksStep(ctx("build", { customScene }));
    expect(first).toMatchObject({ ok: true, costUsd: 0.12 });
    expect(first.resultText).toMatch(/Scènes sur mesure écrites : s2/);
    expect(prompts[0]).toContain("videos/essai/compositions/custom/s2.html");
    expect(prompts[0]).toContain("Trois étapes reliées par une flèche.");
    expect(prompts[0]).toContain('data-composition-id="scene-s2"');
    expect(await readFile(join(dir, "videos/essai/index.html"), "utf8")).toContain('data-composition-src="compositions/custom/s2.html"');
    expect(await calls()).toEqual(["npm run check -- videos/essai", "npx --yes hyperframes@0.0.1 snapshot videos/essai --at 1.5,6,11"]);

    // Same description, same slot: the scene is kept as it is.
    expect((await runBlocksStep(ctx("build", { customScene }))).ok).toBe(true);
    expect(prompts).toHaveLength(1);
  });

  it("fails a custom scene the agent did not write, or that no agent can write", async () => {
    const withCustom = { ...valid, scenes: [{ id: "s1", title: "Schéma", block: "custom", duration: 13, props: { description: "Un schéma." }, voiceover: "", transition: "cut" }] };
    const { ctx } = await fakeWorkspace(withCustom);
    expect((await runBlocksStep(ctx("build"))).resultText).toMatch(/aucun agent n'est disponible/);
    const result = await runBlocksStep(ctx("build", { customScene: async () => ({ ok: true, resultText: "Fait." }) }));
    expect(result).toMatchObject({ ok: false });
    expect(result.resultText).toMatch(/n'a pas été écrite dans compositions\/custom\/s1.html/);
  });
});

describe("structured steps and escalation", () => {
  const brief = {
    title: "Thermo, le café chaud 3 h",
    objective: "Faire connaître la tasse",
    audience: "Télétravailleurs 25-35 ans",
    keyMessage: "Ton café reste chaud 3 heures.",
    points: ["Double paroi céramique", "3 h à 60 °C"],
    callToAction: "thermo.fr, code CHAUD",
    tone: "Complice",
    audio: { voice: true, music: "light lo-fi" },
    assumptions: ["Pas de prix donné : non affiché."],
  };

  it("writes BRIEF.json and BRIEF.md from the studio brief, with no sound for a still", async () => {
    const { dir, ctx } = await fakeWorkspace(valid);
    const bodies: { messages: { content: string }[] }[] = [];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return answer(brief);
    }) as unknown as typeof fetch;
    const creation = { type: "carousel" as const, kind: "oneshot" as const, brief: { message: "Une tasse qui garde le café chaud", engine: "blocks" } };
    const result = await runBlocksStep(ctx("brief", { fetchImpl, creation, format: { width: 1080, height: 1350, frames: 5 } }));
    expect(result).toMatchObject({ ok: true });
    expect(bodies[0].messages[1].content).toContain("Une tasse qui garde le café chaud");
    expect(bodies[0].messages[1].content).toContain("carrousel de 5 slides 1080×1350");
    expect(JSON.parse(await readFile(join(dir, "videos/essai/BRIEF.json"), "utf8")).audio).toEqual({ voice: false, music: null });
    const md = await readFile(join(dir, "videos/essai/BRIEF.md"), "utf8");
    expect(md).toContain("# Thermo, le café chaud 3 h");
    expect(md).toContain("- 3 h à 60 °C");
    expect(md).not.toContain("## Son");
  });

  it("writes a template's VARIABLES.json, refusing a default longer than its maxLength", async () => {
    const { dir, ctx } = await fakeWorkspace(valid);
    await writeFile(join(dir, "videos/essai/BRIEF.md"), "# Brief");
    const long = { variables: [{ id: "headline", type: "string", label: "Accroche", default: "x".repeat(40), maxLength: 30 }] };
    const fixed = { variables: [{ id: "headline", type: "string", label: "Accroche", default: "-30 % sur le lin", maxLength: 30 }] };
    const replies = [answer(long), answer(fixed)];
    const fetchImpl = (async () => replies.shift()!) as unknown as typeof fetch;
    const result = await runBlocksStep(ctx("variables", { fetchImpl }));
    expect(result).toMatchObject({ ok: true, resultText: "headline : Accroche" });
    expect(JSON.parse(await readFile(join(dir, "videos/essai/VARIABLES.json"), "utf8"))).toEqual(fixed.variables);
  });

  it("hands the storyboard to the escalation model after two refused answers, and reports its cost", async () => {
    const models: string[] = [];
    const bad = { ...valid, scenes: [{ ...valid.scenes[0], props: { text: "x".repeat(80) } }, ...valid.scenes.slice(1)] };
    const replies = [answer(bad), answer(bad), answer(valid)];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      models.push(JSON.parse(String(init.body)).model);
      const reply = replies.shift()!;
      const body = JSON.parse(await reply.text());
      return new Response(JSON.stringify({ ...body, usage: { ...body.usage, cost: 0.01 } }), { status: 200 });
    }) as unknown as typeof fetch;
    const events: StudioEvent[] = [];
    const { manifests } = await loadBlocks(SKELETON);
    const result = await writeStoryboard({ ...context(fetchImpl, events), escalationModel: "anthropic/claude-sonnet" }, { manifests, brief: "# Brief", assets: [] });
    expect(models).toEqual(["deepseek/deepseek-v4", "deepseek/deepseek-v4", "anthropic/claude-sonnet"]);
    expect(result.storyboard).not.toBeNull();
    expect(result.escalation).toEqual({ model: "anthropic/claude-sonnet", costUsd: 0.01 });
    expect(result.costUsd).toBeCloseTo(0.03);
    expect(events.some((event) => event.kind === "log" && /Escalade : Storyboard refusé 2 fois/.test(event.text))).toBe(true);
  });

  it("repairs the storyboard after a failed check, then escalates on the second failure", async () => {
    const { dir, ctx, calls } = await fakeWorkspace(valid, { checkFailures: 2 });
    await writeFile(join(dir, "videos/essai/BRIEF.md"), "# Brief");
    const asked: { model: string; request: string }[] = [];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      asked.push({ model: body.model, request: body.messages[1].content });
      return answer({ ...valid, scenes: [{ ...valid.scenes[0], props: { text: "Court" } }, ...valid.scenes.slice(1)] });
    }) as unknown as typeof fetch;
    const result = await runBlocksStep(ctx("build", { fetchImpl, escalationModel: "anthropic/claude-sonnet" }));
    expect(result).toMatchObject({ ok: true, escalation: { model: "anthropic/claude-sonnet", costUsd: 0 } });
    expect(asked.map((call) => call.model)).toEqual(["deepseek/deepseek-v4", "anthropic/claude-sonnet"]);
    expect(asked[0].request).toContain("text_overflow #scene-s1-title");
    expect(result.resultText).toMatch(/storyboard corrigé par anthropic\/claude-sonnet/);
    expect(JSON.parse(await readFile(join(dir, "videos/essai/STORYBOARD.json"), "utf8")).scenes[0].props.text).toBe("Court");
    expect((await calls()).filter((call) => call.startsWith("npm"))).toHaveLength(3);
  });

  it("fails the build when the check keeps failing and there is no escalation model", async () => {
    const { dir, ctx } = await fakeWorkspace(valid, { checkFailures: 5 });
    await writeFile(join(dir, "videos/essai/BRIEF.md"), "# Brief");
    const fetchImpl = (async () => answer(valid)) as unknown as typeof fetch;
    const result = await runBlocksStep(ctx("build", { fetchImpl }));
    expect(result).toMatchObject({ ok: false });
    expect(result.resultText).toMatch(/Le check HyperFrames a échoué/);
    expect(result.escalation).toBeUndefined();
  });
});

describe("visual check", () => {
  it("applies the prop fixes of the vision model, builds again once, and lists the rest for the review", async () => {
    const { dir, ctx, calls } = await fakeWorkspace(valid);
    await mkdir(join(dir, "videos/essai/snapshots"), { recursive: true });
    await writeFile(join(dir, "videos/essai/snapshots/contact-sheet.jpg"), "jpeg");
    const bodies: { model: string; messages: { content: unknown }[] }[] = [];
    const review = {
      issues: [
        { scene: "s1", problem: "Accroche coupée à droite", severity: "high", correction: { props: { text: "Tu perds ton temps ?" } } },
        { scene: "s3", problem: "Le bouton touche le bord", severity: "low", correction: null },
      ],
    };
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return answer(review);
    }) as unknown as typeof fetch;
    const result = await runBlocksStep(ctx("build", { fetchImpl, visualModel: "google/gemini-flash" }));
    expect(result).toMatchObject({ ok: true });
    expect(bodies).toHaveLength(1);
    expect(bodies[0].model).toBe("google/gemini-flash");
    expect(JSON.stringify(bodies[0].messages[1].content)).toContain("data:image/jpeg;base64,");
    expect(JSON.stringify(bodies[0].messages[1].content)).toContain("Vignette 1 : scène s1");
    expect(JSON.parse(await readFile(join(dir, "videos/essai/STORYBOARD.json"), "utf8")).scenes[0].props.text).toBe("Tu perds ton temps ?");
    expect(result.resultText).toContain("Contrôle visuel, corrigé : s1 (Accroche coupée à droite)");
    expect(result.resultText).toContain("- s3, détail : Le bouton touche le bord");
    const saved = JSON.parse(await readFile(join(dir, "videos/essai/VISUAL_REVIEW.json"), "utf8"));
    expect(saved.issues.map((issue: { status: string }) => issue.status)).toEqual(["applied", "open"]);
    // Built, checked and snapshotted twice: before and after the corrections.
    expect(await calls()).toEqual([
      "npm run check -- videos/essai",
      "npx --yes hyperframes@0.0.1 snapshot videos/essai --at 1.5,6,11",
      "npm run check -- videos/essai",
      "npx --yes hyperframes@0.0.1 snapshot videos/essai --at 1.5,6,11",
    ]);
  });

  it("puts the storyboard back when the corrections break the check", async () => {
    const { dir, ctx } = await fakeWorkspace(valid);
    await mkdir(join(dir, "videos/essai/snapshots"), { recursive: true });
    await writeFile(join(dir, "videos/essai/snapshots/contact-sheet.jpg"), "jpeg");
    const fetchImpl = (async () => {
      // The check fails once, right after the corrections.
      await writeFile(join(dir, "fails"), "1");
      return answer({ issues: [{ scene: "s1", problem: "Coupé", severity: "high", correction: { props: { text: "Plus court" } } }] });
    }) as unknown as typeof fetch;
    const result = await runBlocksStep(ctx("build", { fetchImpl, visualModel: "google/gemini-flash" }));
    expect(result).toMatchObject({ ok: true });
    expect(result.resultText).toContain("Corrections du contrôle visuel annulées");
    expect(JSON.parse(await readFile(join(dir, "videos/essai/STORYBOARD.json"), "utf8")).scenes[0].props.text).toBe("Tu perds du temps ?");
  });

  it("does nothing without a vision model", async () => {
    const { ctx } = await fakeWorkspace(valid);
    const result = await runBlocksStep(ctx("build"));
    expect(result.resultText).not.toContain("Contrôle visuel");
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
