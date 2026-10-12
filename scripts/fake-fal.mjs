#!/usr/bin/env node
// Un faux fal, pour essayer les créations réalistes dans l'app sans clé ni dépense.
// Il imite la file d'attente de fal (POST <endpoint>, puis status_url et response_url) et fabrique avec ffmpeg :
//   - pour un modèle d'image, un dégradé tiré du prompt, au format demandé ;
//   - pour un modèle vidéo, un zoom lent sur l'image clé reçue (data URI), à la durée demandée, avec un son si
//     generate_audio est vrai.
//
// Usage :
//   node scripts/fake-fal.mjs [--port 8787] [--delay 2] [--fail <regex>]
// puis lancer le studio avec FAL_KEY=fake et FAL_QUEUE_URL=http://127.0.0.1:8787.
// --delay : secondes passées « en cours » avant le résultat ; --fail : les prompts qui correspondent échouent.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const argv = process.argv.slice(2);
const flag = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : def;
};
const PORT = Number(flag("port", "8787"));
const DELAY_MS = Number(flag("delay", "2")) * 1000;
const FAIL = flag("fail", null) ? new RegExp(flag("fail"), "i") : null;
const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const dir = mkdtempSync(join(tmpdir(), "fake-fal-"));
mkdirSync(join(dir, "files"));

/** Les jobs de la file : endpoint, entrée, statut, résultat. */
const jobs = new Map();
let next = 0;

const SIZES = { "9:16": [720, 1280], "16:9": [1280, 720], "1:1": [1024, 1024], "4:5": [896, 1120], "3:4": [960, 1280] };
const IMAGE_SIZES = { portrait_16_9: "9:16", landscape_16_9: "16:9", square_hd: "1:1", square: "1:1", portrait_4_3: "3:4" };
const sizeOf = (input) => SIZES[input.aspect_ratio] ?? SIZES[IMAGE_SIZES[input.image_size]] ?? SIZES["9:16"];
const isVideo = (endpoint, input) => /video|veo|seedance|pixverse|ltx|wan/i.test(endpoint) && Boolean(input.image_url || input.start_image_url);
const secondsOf = (input) => Number(String(input.duration ?? "5").replace(/s$/, "")) || 5;

/** Deux couleurs et une graine tirées du prompt : le même prompt donne la même image. */
function colors(prompt) {
  const hash = createHash("sha256").update(prompt ?? "").digest();
  const hex = (offset) => `0x${hash.subarray(offset, offset + 3).toString("hex")}`;
  return { c0: hex(0), c1: hex(3), seed: hash.readUInt16BE(6) };
}

async function image(id, input) {
  const [width, height] = sizeOf(input);
  const { c0, c1, seed } = colors(input.prompt);
  const out = join(dir, "files", `${id}.png`);
  await run(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", `gradients=s=${width}x${height}:c0=${c0}:c1=${c1}:seed=${seed}`, "-frames:v", "1", out]);
  return { images: [{ url: `files/${id}.png`, width, height, content_type: "image/png" }], seed, prompt: input.prompt };
}

async function video(id, input) {
  const source = String(input.image_url ?? input.start_image_url);
  const match = /^data:image\/(\w+);base64,(.*)$/s.exec(source);
  if (!match) throw new Error("image_url : seul un data URI est pris en charge par le faux fal");
  const still = join(dir, `${id}.${match[1]}`);
  writeFileSync(still, Buffer.from(match[2], "base64"));
  const seconds = secondsOf(input);
  const [width, height] = sizeOf(input);
  const out = join(dir, "files", `${id}.mp4`);
  const audio = input.generate_audio === true;
  await run(FFMPEG, [
    "-hide_banner", "-loglevel", "error", "-y",
    "-loop", "1", "-i", still,
    ...(audio ? ["-f", "lavfi", "-i", `sine=f=220:d=${seconds}`] : []),
    "-vf", `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},zoompan=z='min(zoom+0.0015,1.3)':d=${seconds * 24}:s=${width}x${height}:fps=24,format=yuv420p`,
    "-t", String(seconds), "-c:v", "libx264", "-preset", "veryfast",
    ...(audio ? ["-c:a", "aac", "-shortest"] : ["-an"]),
    out,
  ]);
  return { video: { url: `files/${id}.mp4`, content_type: "video/mp4" }, seed: colors(input.prompt).seed };
}

function submit(endpoint, input) {
  const id = `fake-${++next}`;
  const job = { endpoint, status: "IN_QUEUE", output: null, error: null };
  jobs.set(id, job);
  console.log(`[fake-fal] ${id} ${endpoint} ${JSON.stringify({ ...input, image_url: input.image_url ? "…" : undefined, start_image_url: input.start_image_url ? "…" : undefined })}`);
  setTimeout(async () => {
    job.status = "IN_PROGRESS";
    try {
      if (FAIL?.test(input.prompt ?? "")) throw new Error("échec simulé (--fail)");
      const output = await (isVideo(endpoint, input) ? video(id, input) : image(id, input));
      // Le délai simule le temps de génération : le résultat n'est prêt qu'après.
      setTimeout(() => Object.assign(job, { status: "COMPLETED", output }), DELAY_MS);
    } catch (error) {
      Object.assign(job, { status: "COMPLETED", error: error instanceof Error ? error.message : String(error) });
    }
  }, 50);
  // Comme fal : des URL de suivi sur queue.fal.run, que le client doit faire passer par sa propre base.
  const base = `https://queue.fal.run/${endpoint}/requests/${id}`;
  return { request_id: id, status_url: `${base}/status`, response_url: base, cancel_url: `${base}/cancel`, queue_position: 0 };
}

const send = (response, status, body) => {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
};

const server = createServer((request, response) => {
  const chunks = [];
  request.on("data", (chunk) => chunks.push(chunk));
  request.on("end", () => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
    const path = url.pathname.replace(/^\/+/, "");
    if (request.method === "GET" && path.startsWith("files/")) {
      try {
        const file = readFileSync(join(dir, "files", path.slice("files/".length).replace(/[^\w.-]/g, "")));
        response.writeHead(200, { "content-type": path.endsWith(".png") ? "image/png" : "video/mp4" });
        return response.end(file);
      } catch {
        return send(response, 404, { detail: "fichier inconnu" });
      }
    }
    const requested = /^(.+)\/requests\/(fake-\d+)(\/status)?$/.exec(path);
    if (request.method === "GET" && requested) {
      const job = jobs.get(requested[2]);
      if (!job) return send(response, 404, { detail: "requête inconnue" });
      if (requested[3]) return send(response, job.status === "COMPLETED" ? 200 : 202, { status: job.status, ...(job.error ? { error: job.error, error_type: "fake_error" } : {}) });
      if (job.status !== "COMPLETED") return send(response, 400, { detail: "pas encore prêt" });
      if (job.error) return send(response, 422, { detail: job.error });
      // Les URL des fichiers sont absolues, comme le CDN de fal.
      const absolute = JSON.parse(JSON.stringify(job.output).replaceAll('"files/', `"http://127.0.0.1:${PORT}/files/`));
      return send(response, 200, absolute);
    }
    if (request.method === "POST" && path) {
      if (!/^Key \S+/.test(request.headers.authorization ?? "")) return send(response, 401, { detail: "clé absente" });
      try {
        return send(response, 200, submit(path, JSON.parse(Buffer.concat(chunks).toString() || "{}")));
      } catch {
        return send(response, 422, { detail: "JSON invalide" });
      }
    }
    send(response, 404, { detail: `${request.method} ${path} inconnu` });
  });
});

server.listen(PORT, "127.0.0.1", () => console.log(`[fake-fal] http://127.0.0.1:${PORT} (fichiers dans ${dir})`));
