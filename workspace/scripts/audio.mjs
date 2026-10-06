#!/usr/bin/env node
// Audio de l'étape « médias » avec les fournisseurs du workspace (OpenRouter, voir CLAUDE.md) :
//   tts       une prise Voxtral par frame de SCRIPT.md     → assets/audio/voxtral/NN.mp3 (brut)
//   normalize crête à TTS_PEAK_DB, 48 kHz mono              → assets/audio/voice/NN.wav
//   music     Lyria (MUSIC_MODEL), coupée et fondue         → assets/audio/music/bgm.mp3 (brut dans .media/music/)
//   meta      timings des mots (whisper, langue --lang)     → audio_meta.json (forme faceless-explainer)
//
// Usage, depuis la racine du workspace :
//   node scripts/audio.mjs videos/<nom> --music "<prompt anglais, instrumental>" [--lang fr] [--steps tts,normalize,music,meta]
// Sans --music, pas de musique (bgm absent de audio_meta.json). SCRIPT.md : un titre `## … (Frame N)` par frame,
// le texte parlé en lignes indentées de 4 espaces.
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HYPERFRAMES = "hyperframes@0.8.134";
const MUSIC_TAIL_S = 1.5;
const MUSIC_FADE_S = 2;
const BGM_VOLUME = 0.18;

const argv = process.argv.slice(2);
const video = argv[0];
const flag = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : def;
};
if (!video || !existsSync(join(video, "SCRIPT.md"))) {
  console.error("usage: node scripts/audio.mjs videos/<nom> [--music \"<prompt>\"] [--lang fr] [--steps tts,normalize,music,meta]");
  process.exit(1);
}
const musicPrompt = flag("music", null);
const lang = flag("lang", "fr");
const steps = new Set(flag("steps", "tts,normalize,music,meta").split(","));

const env = {
  ...Object.fromEntries(
    (existsSync(".env") ? readFileSync(".env", "utf8") : "")
      .split(/\r?\n/)
      .filter((l) => /^[A-Z_]+=/.test(l))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
  ),
  ...process.env,
};
const r3 = (n) => Math.round(n * 1000) / 1000;
const pad2 = (n) => String(n).padStart(2, "0");
const duration = (file) =>
  Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" }));
const peak = (file) => {
  const log = spawnSync("ffmpeg", ["-hide_banner", "-i", file, "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8" }).stderr;
  const match = log.match(/max_volume:\s*(-?[\d.]+) dB/);
  if (!match) throw new Error(`volumedetect failed on ${file}: ${log.slice(-500)}`);
  return Number(match[1]);
};
const requireKey = () => {
  if (!env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY manquant dans .env");
  return { base: env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1", key: env.OPENROUTER_API_KEY };
};

/** SCRIPT.md → Map(frame → texte parlé). */
function scriptLines() {
  const lines = new Map();
  let frame = null;
  for (const line of readFileSync(join(video, "SCRIPT.md"), "utf8").split(/\r?\n/)) {
    const heading = line.match(/^##\s+.*\(Frame\s+(\d+)\)/i);
    if (heading) {
      frame = Number(heading[1]);
      lines.set(frame, "");
      continue;
    }
    const spoken = frame != null && line.match(/^ {4,}(.+)$/);
    if (spoken) lines.set(frame, `${lines.get(frame)} ${spoken[1].trim()}`.trim());
  }
  for (const [frame, text] of lines) if (!text) lines.delete(frame);
  if (!lines.size) throw new Error("SCRIPT.md : aucune ligne parlée (titres `## … (Frame N)`, texte indenté de 4 espaces)");
  return lines;
}

async function tts() {
  const { base, key } = requireKey();
  const outDir = join(video, "assets/audio/voxtral");
  mkdirSync(outDir, { recursive: true });
  for (const [frame, text] of scriptLines()) {
    const res = await fetch(`${base}/audio/speech`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: env.TTS_MODEL, voice: env.TTS_VOICE, input: text, response_format: "mp3" }),
    });
    if (!res.ok) throw new Error(`tts frame ${frame}: HTTP ${res.status} ${await res.text()}`);
    const out = join(outDir, `${pad2(frame)}.mp3`);
    writeFileSync(out, Buffer.from(await res.arrayBuffer()));
    console.log(`tts frame ${frame} → ${out} : ${text}`);
  }
}

function normalize() {
  const target = Number(env.TTS_PEAK_DB ?? -1);
  const rawDir = join(video, "assets/audio/voxtral");
  const outDir = join(video, "assets/audio/voice");
  mkdirSync(outDir, { recursive: true });
  for (const file of readdirSync(rawDir).filter((n) => n.endsWith(".mp3")).sort()) {
    const raw = join(rawDir, file);
    const gain = target - peak(raw);
    const out = join(outDir, file.replace(".mp3", ".wav"));
    execFileSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", raw, "-af", `volume=${gain.toFixed(2)}dB`, "-ar", "48000", "-ac", "1", out]);
    const md5 = createHash("md5").update(readFileSync(raw)).digest("hex").slice(0, 8);
    console.log(`normalize ${file} (md5 ${md5}) gain ${gain.toFixed(2)} dB → ${out} · ${duration(out).toFixed(3)} s`);
  }
}

function voiceTotal() {
  const dir = join(video, "assets/audio/voice");
  return readdirSync(dir)
    .filter((n) => n.endsWith(".wav"))
    .reduce((sum, n) => sum + duration(join(dir, n)), 0);
}

async function music() {
  if (!musicPrompt) return console.log("music : pas de --music, aucune musique");
  const { base, key } = requireKey();
  const mediaDir = join(video, ".media/music");
  mkdirSync(mediaDir, { recursive: true });
  writeFileSync(join(mediaDir, "prompt.txt"), `${musicPrompt}\n`);
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: env.MUSIC_MODEL, messages: [{ role: "user", content: musicPrompt }], modalities: ["text", "audio"], stream: true }),
  });
  const body = await res.text();
  writeFileSync(join(mediaDir, "lyria-response.sse"), body);
  if (!res.ok) throw new Error(`music: HTTP ${res.status} ${body.slice(0, 2000)}`);

  let b64 = "";
  let text = "";
  for (const line of body.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (payload === "[DONE]") continue;
    let chunk;
    try {
      chunk = JSON.parse(payload);
    } catch {
      continue;
    }
    if (chunk.error) throw new Error(`music: ${JSON.stringify(chunk.error)}`);
    const delta = chunk.choices?.[0]?.delta ?? {};
    if (delta.audio?.data) b64 += delta.audio.data;
    if (typeof delta.content === "string") text += delta.content;
  }
  if (!b64) throw new Error(`music: pas d'audio dans la réponse (${text.slice(0, 300)}), voir ${mediaDir}/lyria-response.sse`);
  const buf = Buffer.from(b64, "base64");
  const magic = buf.subarray(0, 4).toString("latin1");
  const raw = join(mediaDir, `lyria-raw.${magic === "RIFF" ? "wav" : "mp3"}`);
  writeFileSync(raw, buf);

  // Coupée à la durée de la voix + une queue, avec un fondu de sortie.
  const length = Math.min(duration(raw), voiceTotal() + MUSIC_TAIL_S);
  const out = join(video, "assets/audio/music/bgm.mp3");
  mkdirSync(join(video, "assets/audio/music"), { recursive: true });
  execFileSync("ffmpeg", [
    "-y", "-hide_banner", "-loglevel", "error", "-i", raw, "-t", length.toFixed(3),
    "-af", `afade=t=out:st=${Math.max(0, length - MUSIC_FADE_S).toFixed(3)}:d=${MUSIC_FADE_S}`,
    "-c:a", "libmp3lame", "-b:a", "192k", out,
  ]);
  console.log(`music → ${out} · ${duration(out).toFixed(3)} s (brut ${raw})`);
}

/** Les mots de ponctuation française isolés (« ? », « : ») sont collés au mot précédent. */
const tokens = (text) =>
  text.split(/\s+/).reduce((acc, w) => (/^[?!:;»]+$/.test(w) && acc.length ? ((acc[acc.length - 1] += ` ${w}`), acc) : (acc.push(w), acc)), []);

function meta() {
  const script = scriptLines();
  const scratch = mkdtempSync(join(tmpdir(), "studio-audio-"));
  const voices = [];
  try {
    const dir = join(video, "assets/audio/voice");
    for (const file of readdirSync(dir).filter((n) => n.endsWith(".wav")).sort()) {
      const frame = Number(file.slice(0, 2));
      const abs = join(dir, file);
      const out = join(scratch, file);
      const run = spawnSync(
        "npx",
        ["--yes", HYPERFRAMES, "transcribe", abs, "--engine", "whisper", "--model", "small", "--language", lang, "--dir", out, "--json"],
        { encoding: "utf8" },
      );
      if (run.status !== 0) throw new Error(`transcribe ${file}: ${run.stderr.slice(-1000)}`);
      const heard = JSON.parse(readFileSync(join(out, "transcript.json"), "utf8"));
      const want = tokens(script.get(frame) ?? "");
      // Même nombre de mots : on garde l'orthographe du script avec les timings de whisper.
      const aligned = heard.length === want.length;
      const words = heard.map((w, i) => ({ id: `w${i}`, text: aligned ? want[i] : w.text, start: r3(w.start), end: r3(w.end) }));
      voices.push({ frame, path: `assets/audio/voice/${file}`, duration_s: r3(duration(abs)), words });
      console.log(`meta frame ${frame} : ${words.length} mots (${aligned ? "texte du script" : `texte whisper, ${heard.length}≠${want.length}`})`);
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }

  const bgmPath = "assets/audio/music/bgm.mp3";
  const hasBgm = existsSync(join(video, bgmPath));
  const prompt = join(video, ".media/music/prompt.txt");
  const audioMeta = {
    ...(hasBgm && {
      bgm: {
        path: bgmPath,
        volume: BGM_VOLUME,
        query: existsSync(prompt) ? readFileSync(prompt, "utf8").trim() : "MUSIC_MODEL",
        duration_s: r3(duration(join(video, bgmPath))),
      },
    }),
    bgm_pending: false,
    voices,
    sfx: [],
  };
  writeFileSync(join(video, "audio_meta.json"), `${JSON.stringify(audioMeta, null, 2)}\n`);
  const total = voices.reduce((sum, v) => sum + v.duration_s, 0);
  console.log(`audio_meta.json : ${voices.length} voix, ${r3(total)} s de voix${hasBgm ? `, musique ${audioMeta.bgm.duration_s} s` : ", sans musique"}`);
}

if (steps.has("tts")) await tts();
if (steps.has("normalize")) normalize();
if (steps.has("music")) await music();
if (steps.has("meta")) meta();
