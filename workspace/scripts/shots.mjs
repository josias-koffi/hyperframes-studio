#!/usr/bin/env node
// Plans générés d'une vidéo réaliste, par la file d'attente de fal (voir CLAUDE.md) :
//   keyframes  une image clé par plan (IMAGE_MODEL), depuis shot.prompt + style  → assets/shots/sN.png
//   shots      une vidéo par plan depuis son image clé (modèle vidéo de la passe)  → assets/shots/sN.mp4
// Les plans sont les scènes de STORYBOARD.json qui ont un `shot`. Réponses brutes de fal dans .media/fal/,
// suivi dans shots_meta.json (modèle, prompt, graine, durée, coût estimé, statut).
//
// Usage, depuis la racine du workspace :
//   node scripts/shots.mjs videos/<nom> --steps keyframes,shots [--only s1,s3] [--pass draft|final] [--aspect 9:16]
//   node scripts/shots.mjs videos/<nom> --estimate [--only s1,s3]   → coût estimé, sans appel (shots_meta.json)
// --pass draft (défaut) utilise VIDEO_DRAFT_MODEL, --pass final VIDEO_FINAL_MODEL.
// Dans le studio, FAL_BASE_URL et FAL_KEY sont le proxy et le jeton du job (la vraie clé fal reste dans le studio),
// les modèles et leurs prix (FAL_PRICES, JSON) viennent du catalogue. FAL_REFERENCES=1 : l'utilisateur accepte que
// les images fournies (shot.reference) partent chez fal.
// Le coût est une estimation : prix du catalogue × secondes (ou images) demandées. fal ne renvoie pas le prix d'une requête.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const argv = process.argv.slice(2);
const video = argv[0];
const flag = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : def;
};
if (!video || !existsSync(join(video, "STORYBOARD.json"))) {
  console.error("usage: node scripts/shots.mjs videos/<nom> --steps keyframes,shots [--only s1,s3] [--pass draft|final] [--aspect 9:16] | --estimate");
  process.exit(1);
}
const steps = new Set(flag("steps", "keyframes,shots").split(","));
const only = flag("only", null)?.split(",").filter(Boolean) ?? null;
const pass = flag("pass", "draft");
const aspect = flag("aspect", "9:16");
const estimateOnly = argv.includes("--estimate");
if (!["draft", "final"].includes(pass)) {
  console.error("--pass vaut draft ou final");
  process.exit(1);
}

const readText = (file) => (existsSync(file) ? readFileSync(file, "utf8") : "");
const readEnvFile = (file) =>
  Object.fromEntries(
    readText(file)
      .split(/\r?\n/)
      .filter((l) => /^[A-Z_]+=/.test(l))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
  );
const env = { ...readEnvFile(".env"), ...process.env, ...readEnvFile(join(video, ".studio.env")) };
const prices = (() => {
  try {
    return JSON.parse(env.FAL_PRICES || "{}");
  } catch {
    return {};
  }
})();
const r4 = (n) => Math.round(n * 10000) / 10000;
const POLL_MS = Number(env.FAL_POLL_MS || 3000);
const TIMEOUT_MS = Number(env.FAL_TIMEOUT_S || 900) * 1000;

const storyboard = JSON.parse(readFileSync(join(video, "STORYBOARD.json"), "utf8"));
const style = storyboard.style?.trim() ?? "";
const scenes = storyboard.scenes.filter((scene) => scene.shot && (!only || only.includes(scene.id)));
const metaPath = join(video, "shots_meta.json");
const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, "utf8")) : {};
meta.scenes ??= {};
meta.spentUsd ??= 0;
// Le budget de la création (USD), pour la revue : le studio s'arrête au-delà et demande une confirmation.
if (env.FAL_BUDGET_USD) meta.budgetUsd = Number(env.FAL_BUDGET_USD);
const save = () => writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`);

// ---- Adaptateurs : chaque modèle fal a son propre schéma d'entrée (vérifiés sur l'OpenAPI de fal le 12/10/2026). ----

const IMAGE_SIZE = { "9:16": "portrait_16_9", "16:9": "landscape_16_9", "1:1": "square_hd", "4:5": "portrait_4_3" };

/** Le modèle d'image : son endpoint (un modèle d'édition a un endpoint texte seul) et ses entrées. */
function imageRequest(model, { prompt, reference }) {
  if (/kontext/.test(model)) {
    if (reference) return { endpoint: model, input: { prompt, image_url: reference, aspect_ratio: aspect, output_format: "png" } };
    return { endpoint: model.endsWith("/text-to-image") ? model : `${model}/text-to-image`, input: { prompt, aspect_ratio: aspect, output_format: "png" } };
  }
  if (/flux\/(schnell|dev)|flux-1\//.test(model))
    return { endpoint: model, input: { prompt, image_size: IMAGE_SIZE[aspect] ?? "portrait_16_9", num_images: 1, output_format: "png" } };
  // Nano Banana et Seedream : l'image de référence passe par leur endpoint d'édition, en liste.
  if (/nano-banana/.test(model)) {
    const base = model.replace(/\/edit$/, "");
    if (reference) return { endpoint: `${base}/edit`, input: { prompt, image_urls: [reference], aspect_ratio: aspect, num_images: 1, output_format: "png" } };
    return { endpoint: base, input: { prompt, aspect_ratio: aspect, num_images: 1, output_format: "png" } };
  }
  if (/seedream\/v4/.test(model)) {
    const base = model.replace(/\/(text-to-image|edit)$/, "");
    const image_size = IMAGE_SIZE[aspect] ?? "portrait_16_9";
    if (reference) return { endpoint: `${base}/edit`, input: { prompt, image_urls: [reference], image_size, num_images: 1 } };
    return { endpoint: `${base}/text-to-image`, input: { prompt, image_size, num_images: 1 } };
  }
  // Par défaut : les champs les plus courants des modèles d'image de fal.
  return { endpoint: model, input: { prompt, aspect_ratio: aspect, num_images: 1, ...(reference ? { image_url: reference } : {}) } };
}

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
/** LTX ne connaît que 16:9 et 9:16 ; « auto » suit l'image clé. */
const ltxAspect = () => (aspect === "16:9" || aspect === "9:16" ? aspect : "auto");
/** Les modèles vidéo : durées acceptées (secondes), puis l'entrée de fal. */
const VIDEO_ADAPTERS = [
  {
    match: /veo-?3/,
    durations: [4, 6, 8],
    input: ({ prompt, image, duration, audio }) => ({
      prompt,
      image_url: image,
      duration: `${duration}s`,
      aspect_ratio: aspect === "16:9" || aspect === "9:16" ? aspect : "auto",
      resolution: "720p",
      generate_audio: audio,
    }),
  },
  {
    match: /kling-video\/v3\//,
    durations: range(3, 15),
    input: ({ prompt, image, duration, audio }) => ({ prompt, start_image_url: image, duration: String(duration), generate_audio: audio }),
  },
  {
    match: /kling-video\/o3\//,
    durations: range(3, 15),
    input: ({ prompt, image, duration, audio }) => ({ prompt, image_url: image, duration: String(duration), generate_audio: audio }),
  },
  {
    match: /kling-video\//,
    durations: [5, 10],
    input: ({ prompt, image, duration }) => ({ prompt, image_url: image, duration: String(duration) }),
  },
  {
    match: /seedance/,
    durations: range(4, 15),
    input: ({ prompt, image, duration, audio }) => ({ prompt, image_url: image, duration: String(duration), aspect_ratio: aspect, resolution: "720p", generate_audio: audio }),
  },
  {
    // PixVerse V6 : durée en entier, le son a son propre nom, le cadre vient de l'image.
    match: /pixverse\/v6\//,
    durations: range(1, 15),
    input: ({ prompt, image, duration, audio }) => ({ prompt, image_url: image, duration, resolution: "720p", generate_audio_switch: audio }),
  },
  {
    // LTX-2.3 : 1080p au minimum, son généré par défaut ; la version fast va jusqu'à 20 s.
    match: /ltx-2\.3\/image-to-video\/fast/,
    durations: [6, 8, 10, 12, 14, 16, 18, 20],
    input: ({ prompt, image, duration, audio }) => ({ prompt, image_url: image, duration, aspect_ratio: ltxAspect(), resolution: "1080p", generate_audio: audio }),
  },
  {
    match: /ltx-2\.3\/image-to-video/,
    durations: [6, 8, 10],
    input: ({ prompt, image, duration, audio }) => ({ prompt, image_url: image, duration, aspect_ratio: ltxAspect(), resolution: "1080p", generate_audio: audio }),
  },
  {
    // Wan 2.7 : pas de son généré, le cadre vient de l'image ; sans réécriture du prompt, pour garder le style commun.
    match: /wan\/v2\.7\//,
    durations: range(2, 15),
    input: ({ prompt, image, duration }) => ({ prompt, image_url: image, duration, resolution: "720p", enable_prompt_expansion: false }),
  },
  {
    match: /wan-3\.0/,
    durations: range(2, 15),
    input: ({ prompt, image, duration, audio }) => ({ prompt, start_image_url: image, duration, aspect_ratio: aspect, resolution: "720p", audio, enable_prompt_expansion: false }),
  },
  {
    // Par défaut, pour un modèle absent de cette liste : les champs les plus courants, à vérifier sur la page du modèle.
    match: /./,
    durations: [5, 10],
    input: ({ prompt, image, duration, audio }) => ({ prompt, image_url: image, duration: String(duration), aspect_ratio: aspect, generate_audio: audio }),
  },
];
const videoAdapter = (model) => VIDEO_ADAPTERS.find((adapter) => adapter.match.test(model));
/** La plus courte durée acceptée qui couvre la scène : le plan est coupé à la durée de la scène au montage. */
const shotSeconds = (model, wanted) => videoAdapter(model).durations.find((d) => d >= wanted) ?? videoAdapter(model).durations.at(-1);

const priceOf = (model) => prices[model] ?? null;
const imageCost = (model) => priceOf(model)?.usd ?? 0;
const videoCost = (model, seconds, audio) => {
  const price = priceOf(model);
  return price ? seconds * (audio && price.usdWithAudio !== undefined ? price.usdWithAudio : price.usd) : 0;
};

// ---- File d'attente de fal ----

const falBase = () => {
  if (!env.FAL_KEY) throw new Error("FAL_KEY manquant : la clé fal se règle dans le studio (variable FAL_KEY du cœur)");
  return (env.FAL_BASE_URL || "https://queue.fal.run").replace(/\/$/, "");
};
/** Les URL de suivi que fal renvoie pointent sur queue.fal.run : on les fait passer par la même base (le proxy). */
const viaBase = (url) => url.replace(/^https:\/\/queue\.fal\.run/, falBase());
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function falCall(endpoint, input, rawName) {
  const headers = { Authorization: `Key ${env.FAL_KEY}`, "Content-Type": "application/json" };
  const submit = await fetch(`${falBase()}/${endpoint}`, { method: "POST", headers, body: JSON.stringify(input) });
  const queued = await submit.text();
  if (!submit.ok) throw new Error(`${endpoint} : HTTP ${submit.status} ${queued.slice(0, 1000)}`);
  const { request_id: id, status_url: statusUrl, response_url: responseUrl } = JSON.parse(queued);
  const started = Date.now();
  for (;;) {
    await sleep(POLL_MS);
    const res = await fetch(viaBase(statusUrl), { headers });
    const status = await res.json().catch(() => ({}));
    if (status.status === "COMPLETED") {
      if (status.error) throw new Error(`${endpoint} (${id}) : ${status.error_type ?? "erreur"} ${status.error}`);
      break;
    }
    if (!res.ok && res.status !== 202) throw new Error(`${endpoint} (${id}) : statut HTTP ${res.status}`);
    if (Date.now() - started > TIMEOUT_MS) throw new Error(`${endpoint} (${id}) : pas de résultat après ${TIMEOUT_MS / 1000} s`);
  }
  const res = await fetch(viaBase(responseUrl), { headers });
  const text = await res.text();
  mkdirSync(join(video, ".media/fal"), { recursive: true });
  writeFileSync(join(video, ".media/fal", `${rawName}.json`), text);
  if (!res.ok) throw new Error(`${endpoint} (${id}) : résultat HTTP ${res.status} ${text.slice(0, 1000)}`);
  return { id, output: JSON.parse(text) };
}

async function download(url, out) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`téléchargement ${url} : HTTP ${res.status}`);
  writeFileSync(out, Buffer.from(await res.arrayBuffer()));
}

const dataUri = (file, type) => `data:${type};base64,${readFileSync(file).toString("base64")}`;
const MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };
const stamp = () => new Date().toISOString().replace(/[:.]/g, "-");

// ---- Étapes ----

let runCost = 0;
const failures = [];

async function keyframe(scene) {
  const model = env.IMAGE_MODEL;
  if (!model) throw new Error("IMAGE_MODEL manquant : choisis un modèle d'image dans les réglages IA");
  const prompt = [scene.shot.prompt.trim(), style].filter(Boolean).join(". ");
  const ref = scene.shot.reference;
  let reference = null;
  if (ref && env.FAL_REFERENCES === "1" && existsSync(join(video, ref))) {
    reference = dataUri(join(video, ref), MIME[ref.split(".").pop().toLowerCase()] ?? "image/png");
  } else if (ref) {
    console.log(`keyframes ${scene.id} : image de référence ${ref} non envoyée (pas d'accord pour l'envoyer à fal)`);
  }
  const { endpoint, input } = imageRequest(model, { prompt, reference });
  const { id, output } = await falCall(endpoint, input, `${scene.id}-keyframe-${stamp()}`);
  const url = output.images?.[0]?.url ?? output.image?.url;
  if (!url) throw new Error(`${endpoint} : pas d'image dans la réponse`);
  const out = join(video, `assets/shots/${scene.id}.png`);
  const raw = `${out}.download`;
  await download(url, raw);
  // Une image clé reste un PNG, quel que soit le format rendu par le modèle.
  execFileSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", raw, "-frames:v", "1", `${out}.tmp.png`]);
  renameSync(`${out}.tmp.png`, out);
  execFileSync("rm", ["-f", raw]);
  const costUsd = imageCost(model);
  runCost += costUsd;
  meta.scenes[scene.id] = {
    ...meta.scenes[scene.id],
    keyframe: { model, prompt, reference: Boolean(reference), seed: output.seed ?? null, requestId: id, costUsd: r4(costUsd), at: new Date().toISOString(), status: "ok" },
  };
  console.log(`keyframes ${scene.id} → assets/shots/${scene.id}.png (${model}, ≈ ${r4(costUsd)} $)`);
}

async function shot(scene) {
  const model = pass === "final" ? env.VIDEO_FINAL_MODEL : env.VIDEO_DRAFT_MODEL;
  if (!model) throw new Error(`${pass === "final" ? "VIDEO_FINAL_MODEL" : "VIDEO_DRAFT_MODEL"} manquant : choisis les modèles vidéo dans les réglages IA`);
  const keyframePath = join(video, `assets/shots/${scene.id}.png`);
  if (!existsSync(keyframePath)) throw new Error(`image clé absente (assets/shots/${scene.id}.png) : relance l'étape images clés`);
  const prompt = [scene.shot.prompt.trim(), scene.shot.camera ? `Camera: ${scene.shot.camera.trim()}` : "", style].filter(Boolean).join(". ");
  const seconds = shotSeconds(model, scene.duration);
  const audio = Boolean(scene.shot.audio);
  const input = videoAdapter(model).input({ prompt, image: dataUri(keyframePath, "image/png"), duration: seconds, audio });
  const { id, output } = await falCall(model, input, `${scene.id}-shot-${pass}-${stamp()}`);
  const url = output.video?.url ?? output.video_url;
  if (!url) throw new Error(`${model} : pas de vidéo dans la réponse`);
  await download(url, join(video, `assets/shots/${scene.id}.mp4`));
  const costUsd = videoCost(model, seconds, audio);
  runCost += costUsd;
  meta.scenes[scene.id] = {
    ...meta.scenes[scene.id],
    shot: { model, pass, prompt, seconds, audio, seed: output.seed ?? null, requestId: id, costUsd: r4(costUsd), at: new Date().toISOString(), status: "ok" },
  };
  console.log(`shots ${scene.id} → assets/shots/${scene.id}.mp4 (${model}, ${pass}, ${seconds} s, ≈ ${r4(costUsd)} $)`);
}

/** Ce que coûteraient les plans : image clé, brouillon et passe finale, par scène. */
function estimate() {
  const perScene = {};
  for (const scene of storyboard.scenes.filter((candidate) => candidate.shot)) {
    const audio = Boolean(scene.shot.audio);
    const of = (model) => (model ? { model, seconds: shotSeconds(model, scene.duration), usd: r4(videoCost(model, shotSeconds(model, scene.duration), audio)), priced: Boolean(priceOf(model)) } : null);
    perScene[scene.id] = {
      keyframe: env.IMAGE_MODEL ? { model: env.IMAGE_MODEL, usd: r4(imageCost(env.IMAGE_MODEL)), priced: Boolean(priceOf(env.IMAGE_MODEL)) } : null,
      draft: of(env.VIDEO_DRAFT_MODEL),
      final: of(env.VIDEO_FINAL_MODEL),
    };
  }
  return perScene;
}

mkdirSync(join(video, "assets/shots"), { recursive: true });
meta.estimate = estimate();
if (estimateOnly) {
  const ids = scenes.map((scene) => scene.id);
  const sum = (key) => r4(ids.reduce((total, id) => total + (meta.estimate[id]?.[key]?.usd ?? 0), 0));
  // Un modèle sans prix au catalogue : le budget ne peut pas être vérifié.
  const unpriced = [...new Set(ids.flatMap((id) => ["keyframe", "draft", "final"].map((key) => meta.estimate[id]?.[key]).filter((e) => e && !e.priced).map((e) => e.model)))];
  save();
  console.log(JSON.stringify({ scenes: ids, keyframes: sum("keyframe"), draft: sum("draft"), final: sum("final"), spentUsd: meta.spentUsd, unpriced }));
  process.exit(0);
}
if (!scenes.length) {
  console.log(only ? `aucun plan généré parmi ${only.join(", ")}` : "STORYBOARD.json n'a aucun plan généré (shot)");
  save();
  process.exit(0);
}

// Les plans partent ensemble dans la file de fal ; un plan raté n'empêche pas les autres.
for (const step of ["keyframes", "shots"].filter((name) => steps.has(name))) {
  await Promise.all(
    scenes.map((scene) =>
      (step === "keyframes" ? keyframe(scene) : shot(scene)).catch((error) => {
        const key = step === "keyframes" ? "keyframe" : "shot";
        meta.scenes[scene.id] = { ...meta.scenes[scene.id], [key]: { ...meta.scenes[scene.id]?.[key], status: "failed", error: error.message, at: new Date().toISOString() } };
        failures.push(`${step} ${scene.id} : ${error.message}`);
        console.error(`${step} ${scene.id} : ${error.message}`);
      }),
    ),
  );
  if (failures.length) break;
}
meta.spentUsd = r4(meta.spentUsd + runCost);
save();
console.log(`fal-cost-usd: ${r4(runCost)}`);
if (failures.length) {
  console.error(`${failures.length} plan(s) en échec :\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
