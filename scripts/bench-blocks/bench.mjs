#!/usr/bin/env node
// Banc du moteur blocs : pour chaque brief de référence (briefs.mjs), le storyboard est demandé au modèle avec les
// prompts du runner, validé par le studio (3 essais, les erreurs renvoyées au modèle), puis assemblé et passé à
// `hyperframes check`. Voir README.md.
//
//   node scripts/bench-blocks/bench.mjs [--model haiku[,deepseek/deepseek-v4…]] [--only b01-cafe-tiktok] [--out /tmp/bench-blocks]
//
// --model : un alias Claude (haiku, sonnet…) passe par `claude -p`, donc par l'abonnement Claude Code ; un id
// OpenRouter (deepseek/deepseek-v4…) passe par OpenRouter, avec OPENROUTER_API_KEY (environnement ou .env).
// Plusieurs modèles séparés par des virgules passent l'un après l'autre, puis un tableau les compare.
import { execFile, execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import allBriefs from "./briefs.mjs";

const run = promisify(execFile);
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const HYPERFRAMES = "hyperframes@0.8.134";

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 && index + 1 < argv.length ? argv[index + 1] : fallback;
};
const models = flag("model", "haiku")
  .split(",")
  .map((name) => name.trim())
  .filter(Boolean);
const only = flag("only", null);
const root = resolve(flag("out", join(tmpdir(), "bench-blocks")));

for (const dist of ["packages/shared/dist/index.js", "apps/claude-runner/dist/blocks.js"])
  if (!existsSync(join(REPO, dist))) {
    console.error(`${dist} absent : lance d'abord pnpm build.`);
    process.exit(1);
  }
// The studio's own code, built to CommonJS.
const shared = (await import(pathToFileURL(join(REPO, "packages/shared/dist/index.js")).href)).default;
const runner = (await import(pathToFileURL(join(REPO, "apps/claude-runner/dist/blocks.js")).href)).default;
const briefs = allBriefs.filter((brief) => !only || brief.id === only);

const ws = join(root, "ws");
const env = { ...process.env, HYPERFRAMES_NO_TELEMETRY: "1" };
/** Results of one model: `<out>/<model>/`, the slashes of an OpenRouter id replaced. */
const outFor = (model) => (models.length > 1 ? join(root, model.replace(/[^\w.-]+/g, "_")) : root);

function openrouterKey() {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  const file = join(REPO, ".env");
  const line = existsSync(file) ? readFileSync(file, "utf8").split(/\r?\n/).find((l) => l.startsWith("OPENROUTER_API_KEY=")) : null;
  return line ? line.slice(line.indexOf("=") + 1).trim() : null;
}

/** Stand-in for an uploaded file: a gradient photo, or a ring for a logo. */
function placeholder(file) {
  mkdirSync(dirname(file), { recursive: true });
  const colors = ["0x2b5876:0x4e4376", "0xf5af19:0xf12711", "0x11998e:0x38ef7d", "0x8e2de2:0x4a00e0"][file.length % 4].split(":");
  const input = /logo/.test(file)
    ? ["-f", "lavfi", "-i", "color=c=black@0:s=400x400,format=rgba", "-vf", "geq=r='255':g='255':b='255':a='if(lt(hypot(X-200,Y-200),150)*gt(hypot(X-200,Y-200),95),255,if(lt(hypot(X-200,Y-200),60),255,0))'"]
    : ["-f", "lavfi", "-i", `gradients=s=1080x1350:c0=${colors[0]}:c1=${colors[1]}`];
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", ...input, "-frames:v", "1", file]);
}

/** `claude -p`, stateless: a refused answer goes back in the next prompt with its errors. */
async function viaClaude(model, brief, manifests, format) {
  const system = runner.storyboardSystemPrompt(manifests, format);
  const base = runner.storyboardUserPrompt({ campaign: brief.campaign, brief: brief.brief, assets: brief.assets });
  const attempts = [];
  let cost = 0;
  let prompt = base;
  for (let attempt = 1; attempt <= runner.STORYBOARD_ATTEMPTS; attempt++) {
    const { stdout } = await run(
      "claude",
      ["-p", "--model", model, "--tools", "", "--strict-mcp-config", "--no-session-persistence", "--output-format", "json", "--system-prompt", system, prompt],
      { cwd: root, maxBuffer: 64 * 1024 * 1024, timeout: 300_000 },
    );
    const answer = JSON.parse(stdout);
    cost += answer.total_cost_usd ?? 0;
    const parsed = shared.parseStoryboard(answer.result ?? "", manifests, format);
    const errors = [...parsed.errors, ...(parsed.storyboard ? missingImages(parsed.storyboard, manifests, brief.assets) : [])];
    attempts.push(errors);
    if (parsed.storyboard && errors.length === 0) return { storyboard: parsed.storyboard, attempts, cost };
    prompt = `${base}\n\n## Ta réponse précédente\n\n${answer.result}\n\n## Elle est refusée\n\n- ${errors.join("\n- ")}\n\nCorrige ces points et renvoie le storyboard complet, en JSON seulement.`;
  }
  return { storyboard: null, attempts, cost };
}

/** OpenRouter, through the runner's own loop (json_schema, json_object fallback, answers with the errors). */
async function viaOpenrouterCall(model, brief, manifests, format) {
  const attempts = [];
  const result = await runner.writeStoryboard(
    {
      workspaceDir: ws,
      slug: brief.id,
      step: "storyboard",
      format,
      campaign: brief.campaign,
      model,
      openrouter: { baseUrl: "https://openrouter.ai/api/v1", token: openrouterKey() },
      env: {},
      timeoutMs: 300_000,
      onEvent: (event) => {
        const refused = /^Storyboard refusé \(essai \d+\/\d+\) :\n- ([\s\S]*)$/.exec(event.text ?? "");
        if (refused) attempts.push(refused[1].split("\n- "));
      },
    },
    { manifests, brief: brief.brief, assets: brief.assets },
  );
  if (result.storyboard) attempts.push([]);
  else if (attempts.length === 0) attempts.push(result.errors);
  return { storyboard: result.storyboard, attempts, cost: result.costUsd ?? null };
}

function missingImages(storyboard, manifests, assets) {
  const byId = new Map(manifests.map((manifest) => [manifest.id, manifest]));
  return storyboard.scenes.flatMap((scene) =>
    Object.entries(byId.get(scene.block)?.props ?? {})
      .filter(([key, prop]) => prop.type === "image" && scene.props[key] && !assets.includes(scene.props[key]))
      .map(([key]) => `scène ${scene.id} : « ${scene.props[key]} » n'est pas dans les fichiers disponibles.`),
  );
}

/** Silent voices as long as their words would take (0.36 s a word), the words spread evenly. */
function fakeVoices(storyboard, dir) {
  const voices = [];
  storyboard.scenes.forEach((scene, index) => {
    const words = scene.voiceover.trim().split(/\s+/).filter(Boolean);
    if (!words.length) return;
    const duration = Math.round((words.length * 0.36 + 0.2) * 1000) / 1000;
    const path = `assets/audio/voice/${String(index + 1).padStart(2, "0")}.wav`;
    mkdirSync(join(dir, "assets/audio/voice"), { recursive: true });
    execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono", "-t", String(duration), join(dir, path)]);
    const words_ = words.map((text, k) => ({ text, start: +(0.1 + k * 0.36).toFixed(3), end: +(0.4 + k * 0.36).toFixed(3) }));
    voices.push({ frame: index + 1, path, duration_s: duration, words: words_ });
  });
  return { voices };
}

async function bench(model, brief, manifests, blocks) {
  const out = outFor(model);
  const format = { width: brief.width, height: brief.height, durationSeconds: brief.duration ?? null, frames: brief.frames ?? null, variables: brief.variables ?? null };
  const started = Date.now();
  const asked = await (model.includes("/") ? viaOpenrouterCall : viaClaude)(model, brief, manifests, format);
  const result = { id: brief.id, type: brief.type, kind: brief.kind, attempts: asked.attempts, cost: asked.cost, seconds: 0, storyboardOk: Boolean(asked.storyboard) };
  result.seconds = Math.round((Date.now() - started) / 1000);
  if (!asked.storyboard) return result;
  const { storyboard } = asked;

  // The workspace is shared: the folder of a brief is the last model's.
  const dir = join(ws, "videos", brief.id);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const asset of brief.assets) placeholder(join(dir, asset));
  writeFileSync(join(dir, "STORYBOARD.json"), `${JSON.stringify(storyboard, null, 2)}\n`);
  const assembled = format.frames
    ? shared.assembleStills({ storyboard, blocks, width: brief.width, height: brief.height, variables: format.variables })
    : shared.assembleVideo({ storyboard, blocks, width: brief.width, height: brief.height, audio: storyboard.audio.voice ? fakeVoices(storyboard, dir) : null, variables: format.variables });
  writeFileSync(join(dir, "index.html"), assembled.indexHtml);
  for (const [path, html] of Object.entries(assembled.files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), html);
  }
  result.blocks = storyboard.scenes.map((scene) => scene.block);
  result.overlays = storyboard.overlays.map((overlay) => overlay.block);
  result.duration = assembled.duration;

  const check = await run("npx", ["--yes", HYPERFRAMES, "check", `videos/${brief.id}`], { cwd: ws, env, maxBuffer: 64 * 1024 * 1024, timeout: 600_000 }).then(
    (done) => ({ code: 0, text: done.stdout + done.stderr }),
    (failed) => ({ code: failed.code ?? 1, text: (failed.stdout ?? "") + (failed.stderr ?? "") }),
  );
  writeFileSync(join(out, `${brief.id}.check.log`), check.text);
  result.checkOk = check.code === 0 && /Check passed/.test(check.text);
  // One nested_structure warning per slide is expected: a still keeps its slides inline for the canvas editor.
  result.findings = check.text
    .split("\n")
    .filter((line) => /^\s*[✗⚠]/.test(line) && !line.includes("nested_structure_needs_subcomposition"))
    .map((line) => line.trim());
  const at = shared.sceneMidpoints(assembled.timings).join(",");
  await run("npx", ["--yes", HYPERFRAMES, "snapshot", `videos/${brief.id}`, "--at", at], { cwd: ws, env, timeout: 600_000 }).catch(() => {});
  return result;
}

/** Every brief on one model; the summary line of the comparison. */
async function benchModel(model, manifests, blocks) {
  const out = outFor(model);
  mkdirSync(out, { recursive: true });
  console.log(`Banc du moteur blocs · modèle ${model} · ${briefs.length} brief(s) · résultats dans ${out}\n`);
  const results = [];
  for (const brief of briefs) {
    process.stdout.write(`${brief.id} … `);
    const result = await bench(model, brief, manifests, blocks).catch((error) => ({ id: brief.id, error: String(error.message ?? error).slice(0, 500), attempts: [] }));
    results.push(result);
    const cost = typeof result.cost === "number" ? `, ${result.cost.toFixed(4)} $` : "";
    if (result.error) console.log(`ERREUR : ${result.error}`);
    else if (!result.storyboardOk) console.log(`storyboard refusé après ${result.attempts.length} essai(s) (${result.seconds} s${cost})`);
    else console.log(`storyboard en ${result.attempts.length} essai(s), check ${result.checkOk ? "OK" : "ÉCHEC"} (${result.seconds} s${cost})`);
    writeFileSync(join(out, "results.json"), `${JSON.stringify({ model, results }, null, 2)}\n`);
  }
  const passed = results.filter((result) => result.storyboardOk && result.checkOk);
  const first = passed.filter((result) => result.attempts.length === 1);
  const costs = results.map((result) => result.cost).filter((cost) => typeof cost === "number");
  const cost = costs.length ? costs.reduce((a, b) => a + b, 0) : null;
  const seconds = results.filter((result) => typeof result.seconds === "number").map((result) => result.seconds);
  const mean = seconds.length ? Math.round(seconds.reduce((a, b) => a + b, 0) / seconds.length) : null;
  console.log(`\n${passed.length}/${results.length} réussis, ${first.length} du premier coup${cost !== null ? `, ${cost.toFixed(4)} $` : ""}.`);
  console.log(`Détail : ${join(out, "results.json")} · planches : ${join(ws, "videos", "<brief>", "snapshots")}\n`);
  return { model, total: results.length, passed: passed.length, first: first.length, cost, mean };
}

{
  if (models.some((model) => model.includes("/")) && !openrouterKey()) {
    console.error("OPENROUTER_API_KEY absent (environnement ou .env).");
    process.exit(1);
  }
  mkdirSync(ws, { recursive: true });
  cpSync(join(REPO, "workspace/package.json"), join(ws, "package.json"));
  const { manifests, blocks } = await runner.loadBlocks(join(REPO, "workspace"));
  const rows = [];
  for (const model of models) rows.push(await benchModel(model, manifests, blocks));
  if (rows.length > 1) {
    // The defaults are chosen on these figures: storyboard and check passed at the first answer, cost, time.
    const table = [
      "| Modèle | Réussis | Du premier coup | Coût | Durée moyenne |",
      "| --- | --- | --- | --- | --- |",
      ...rows.map((row) => `| ${row.model} | ${row.passed}/${row.total} | ${row.first} (${Math.round((100 * row.first) / row.total)} %) | ${row.cost !== null ? `${row.cost.toFixed(4)} $` : "—"} | ${row.mean ?? "—"} s |`),
    ].join("\n");
    console.log(table);
    writeFileSync(join(root, "comparison.md"), `${table}\n`);
  }
}
