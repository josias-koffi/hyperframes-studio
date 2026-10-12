import { execFileSync, spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, stat, symlink, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { StudioEvent } from "@studio/shared";
import { afterEach, describe, expect, it } from "vitest";
import { runBlocksStep, type BlocksContext } from "./blocks";

const SKELETON = resolve(__dirname, "../../../workspace");
const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;

const storyboard = {
  version: 1,
  title: "Pub café",
  style: "cinematic, 35mm",
  audio: { voice: false, music: null },
  scenes: [
    { id: "s1", title: "Tasse", block: "video-fullframe", duration: 5, props: { src: "assets/shots/s1.mp4" }, shot: { prompt: "A coffee cup", camera: "slow dolly-in", audio: false } },
    { id: "s2", title: "Grains", block: "video-fullframe", duration: 3, props: { src: "assets/shots/s2.mp4" }, shot: { prompt: "Coffee beans", camera: "", audio: true } },
    { id: "s3", title: "Fin", block: "cta-end", duration: 3, props: { headline: "Essaie-le", action: "Commander" }, transition: "fade" },
  ],
  overlays: [],
};

type Call = { method: string; path: string; body: Record<string, unknown> | null };

/** fal's queue, answering every request at once: an image for an image model, a video otherwise. */
async function fakeFal(png: Buffer) {
  const calls: Call[] = [];
  const server: Server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const path = request.url ?? "";
      const text = Buffer.concat(chunks).toString();
      if (path.startsWith("/files/")) {
        response.end(path.endsWith(".png") ? png : Buffer.from("fake mp4"));
        return;
      }
      calls.push({ method: request.method ?? "", path, body: text ? (JSON.parse(text) as Record<string, unknown>) : null });
      const match = /^\/(.+)\/requests\/(r\d+)(\/status)?$/.exec(path);
      if (request.method === "POST") {
        const id = `r${calls.length}`;
        // fal's own URLs: the script must send them through its base URL (the studio's proxy).
        response.end(JSON.stringify({ request_id: id, status_url: `https://queue.fal.run/${path.slice(1)}/requests/${id}/status`, response_url: `https://queue.fal.run/${path.slice(1)}/requests/${id}` }));
      } else if (match?.[3]) {
        response.end(JSON.stringify({ status: "COMPLETED" }));
      } else if (match) {
        const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/files`;
        response.end(JSON.stringify(/flux/.test(match[1]) ? { images: [{ url: `${base}/k.png` }], seed: 7 } : { video: { url: `${base}/v.mp4` }, seed: 9 }));
      } else {
        response.statusCode = 404;
        response.end("{}");
      }
    });
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  return { calls, server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

let fal: Awaited<ReturnType<typeof fakeFal>> | null = null;
afterEach(() => {
  fal?.server.close();
  fal = null;
});

async function workspace(prices: Record<string, unknown> = {}) {
  const dir = await mkdtemp(join(tmpdir(), "shots-"));
  const png = join(dir, "k.png");
  execFileSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=red:s=32x32", "-frames:v", "1", png]);
  fal = await fakeFal(await readFile(png));
  await symlink(join(SKELETON, "blocks"), join(dir, "blocks"));
  await mkdir(join(dir, "scripts"));
  await copyFile(join(SKELETON, "scripts/shots.mjs"), join(dir, "scripts/shots.mjs"));
  const video = join(dir, "videos/pub");
  await mkdir(video, { recursive: true });
  await writeFile(join(video, "STORYBOARD.json"), JSON.stringify(storyboard));
  await writeFile(join(video, "BRIEF.md"), "# Pub café");
  await writeFile(
    join(video, ".studio.env"),
    [
      `FAL_BASE_URL=${fal.url}`,
      "FAL_KEY=sk-studio-job",
      "FAL_POLL_MS=5",
      "IMAGE_MODEL=fal-ai/flux/schnell",
      "VIDEO_DRAFT_MODEL=fal-ai/kling-video/v3/standard/image-to-video",
      "VIDEO_FINAL_MODEL=fal-ai/veo3.1/fast/image-to-video",
      `FAL_PRICES=${JSON.stringify({
        "fal-ai/flux/schnell": { unit: "image", usd: 0.003 },
        "fal-ai/kling-video/v3/standard/image-to-video": { unit: "second", usd: 0.1 },
        "fal-ai/veo3.1/fast/image-to-video": { unit: "second", usd: 0.2, usdWithAudio: 0.4 },
        ...prices,
      })}`,
    ].join("\n"),
  );
  const events: StudioEvent[] = [];
  const ctx = (step: BlocksContext["step"], shots: BlocksContext["shots"] = {}): BlocksContext => ({
    workspaceDir: dir,
    slug: "pub",
    step,
    format: { width: 1080, height: 1920, durationSeconds: 11, realistic: true },
    campaign: "Café",
    model: "deepseek/deepseek-v4",
    openrouter: null,
    env: { PATH: process.env.PATH ?? "" },
    timeoutMs: 60_000,
    onEvent: (event) => void events.push(event),
    shots: { budgetEur: 5, ...shots },
  });
  const meta = async () => JSON.parse(await readFile(join(video, "shots_meta.json"), "utf8")) as { spentUsd: number; scenes: Record<string, { shot?: { model: string; seconds: number; pass: string } }> };
  return { dir, video, ctx, meta, calls: fal.calls };
}

const submits = (calls: Call[]) => calls.filter((call) => call.method === "POST");

describe.skipIf(!hasFfmpeg)("keyframes and shots", () => {
  it("draws a keyframe per generated shot, with the style, through the base URL", async () => {
    const { video, ctx, meta, calls } = await workspace();
    const result = await runBlocksStep(ctx("keyframes"));
    expect(result).toMatchObject({ ok: true });
    expect(result.resultText).toContain("Images clés : s1, s2");
    expect(result.costUsd).toBeCloseTo(0.006);
    expect(submits(calls).map((call) => [call.path, call.body])).toEqual([
      ["/fal-ai/flux/schnell", { prompt: "A coffee cup. cinematic, 35mm", image_size: "portrait_16_9", num_images: 1, output_format: "png" }],
      ["/fal-ai/flux/schnell", { prompt: "Coffee beans. cinematic, 35mm", image_size: "portrait_16_9", num_images: 1, output_format: "png" }],
    ]);
    expect(calls.filter((call) => call.method === "GET").every((call) => call.path.startsWith("/fal-ai/flux/schnell/requests/"))).toBe(true);
    expect((await stat(join(video, "assets/shots/s1.png"))).size).toBeGreaterThan(0);
    expect((await meta()).spentUsd).toBeCloseTo(0.006);
  });

  it("animates each keyframe with the draft model, then the chosen shots with the final model", async () => {
    const { ctx, meta, calls } = await workspace();
    await runBlocksStep(ctx("keyframes"));
    const draft = await runBlocksStep(ctx("shots"));
    expect(draft).toMatchObject({ ok: true });
    const kling = submits(calls).filter((call) => call.path.includes("kling"));
    expect(kling.map((call) => [call.body?.duration, call.body?.generate_audio, String(call.body?.start_image_url).slice(0, 22)])).toEqual([
      ["5", false, "data:image/png;base64,"],
      ["3", true, "data:image/png;base64,"],
    ]);
    expect(kling[0].body?.prompt).toBe("A coffee cup. Camera: slow dolly-in. cinematic, 35mm");
    // 5 s + 3 s at 0.10 $.
    expect(draft.costUsd).toBeCloseTo(0.8);

    const final = await runBlocksStep(ctx("shots", { only: ["s2"], pass: "final" }));
    expect(final).toMatchObject({ ok: true, resultText: expect.stringContaining("Plans en rendu final : s2") });
    // Veo makes 4, 6 or 8 s: 4 s with sound at 0.40 $.
    expect(submits(calls).at(-1)).toMatchObject({ path: "/fal-ai/veo3.1/fast/image-to-video", body: { duration: "4s", generate_audio: true, aspect_ratio: "9:16" } });
    expect(final.costUsd).toBeCloseTo(1.6);
    const { scenes } = await meta();
    expect([scenes.s1.shot?.pass, scenes.s2.shot?.pass, scenes.s2.shot?.model]).toEqual(["draft", "final", "fal-ai/veo3.1/fast/image-to-video"]);
  });

  it("stops above the budget until the user confirms, without calling fal", async () => {
    const { video, ctx, calls } = await workspace();
    await runBlocksStep(ctx("keyframes"));
    const before = calls.length;
    const blocked = await runBlocksStep(ctx("shots", { budgetEur: 0.5 }));
    expect(blocked).toMatchObject({ ok: false, resultText: expect.stringContaining("dépasserait son budget") });
    expect(calls.length).toBe(before);
    expect(JSON.parse(await readFile(join(video, "shots_budget.json"), "utf8"))).toMatchObject({ step: "shots", only: ["s1", "s2"], pass: "draft", estimateUsd: 0.8 });

    expect(await runBlocksStep(ctx("shots", { budgetEur: 0.5, confirmBudget: true }))).toMatchObject({ ok: true });
    await expect(stat(join(video, "shots_budget.json"))).rejects.toThrow();
  });

  it("asks for a confirmation when a model has no price in the catalog", async () => {
    const { ctx } = await workspace({ "fal-ai/kling-video/v3/standard/image-to-video": undefined });
    await runBlocksStep(ctx("keyframes"));
    expect(await runBlocksStep(ctx("shots"))).toMatchObject({ ok: false, resultText: expect.stringContaining("Prix inconnu") });
  });

  it("rewrites a shot from a comment, then draws and animates that shot again only", async () => {
    const { video, ctx, calls } = await workspace();
    await runBlocksStep(ctx("keyframes"));
    await runBlocksStep(ctx("shots"));
    const before = submits(calls).length;
    const changed = { ...storyboard, scenes: [{ ...storyboard.scenes[0], shot: { ...storyboard.scenes[0].shot, prompt: "A blue coffee cup" } }, ...storyboard.scenes.slice(1)] };
    const asked: string[] = [];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      asked.push((JSON.parse(String(init.body)) as { messages: { content: string }[] }).messages.at(-1)!.content);
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(changed) } }] }), { headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;
    const result = await runBlocksStep({
      ...ctx("shots", { only: ["s1"] }),
      feedback: "Une tasse bleue.",
      openrouter: { baseUrl: "http://proxy.test/api/v1", token: "t" },
      fetchImpl,
    });
    expect(result).toMatchObject({ ok: true });
    expect(asked[0]).toContain("Ne modifie que s1");
    expect(submits(calls).slice(before).map((call) => [call.path.split("/")[1], call.body?.prompt])).toEqual([
      ["fal-ai", "A blue coffee cup. cinematic, 35mm"],
      ["fal-ai", "A blue coffee cup. Camera: slow dolly-in. cinematic, 35mm"],
    ]);
    expect(JSON.parse(await readFile(join(video, "STORYBOARD.json"), "utf8")).scenes[0].shot.prompt).toBe("A blue coffee cup");
  });

  it("builds only once every shot has its video", async () => {
    const { ctx } = await workspace();
    expect(await runBlocksStep(ctx("build"))).toMatchObject({ ok: false, resultText: expect.stringContaining("Plans générés absents (s1, s2)") });
  });
});
