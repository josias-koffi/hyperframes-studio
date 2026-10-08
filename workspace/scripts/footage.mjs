#!/usr/bin/env node
// Analyse du rush de l'étape « footage » : prépare la vidéo fournie pour que Claude la lise en images.
//   probe       taille, durée, cadence, piste audio (ffprobe)            → source
//   cuts        changements de plan (ffmpeg scene) + une image par plan  → shots, footage/frames/shot-NN.jpg
//   sheets      planches horodatées, --fps images par seconde, 5×4        → sheets, footage/sheets/sheet-NN.png
//   transcribe  mots et timings de la piste audio (whisper, langue --lang) → words
// Écrit footage_map.json ; `events` reste vide, Claude le remplit à la lecture des planches.
//
// Usage, depuis la racine du workspace :
//   node scripts/footage.mjs videos/<nom> [--lang fr] [--fps 2] [--threshold 0.3] [--steps probe,cuts,sheets,transcribe]
//   node scripts/footage.mjs videos/<nom> --refine 2.5-3.5 [--refine-fps 10]   → footage/refine/2.5-3.5.png
// La vidéo source est le champ `footage:` du frontmatter de BRIEF.md, dans assets/uploads/ (ou --source <chemin>).
// Une sous-étape relancée seule reprend les autres champs du footage_map.json existant.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

const HYPERFRAMES = "hyperframes@0.8.134";
const COLS = 5;
const ROWS = 4;
const TILE_WIDTH = 320;
const MIN_SHOT_S = 0.2;
const FONT = "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf";

const argv = process.argv.slice(2);
const video = argv[0];
const flag = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : def;
};
if (!video || !existsSync(video)) {
  console.error("usage: node scripts/footage.mjs videos/<nom> [--lang fr] [--fps 2] [--threshold 0.3] [--steps probe,cuts,sheets,transcribe]");
  process.exit(1);
}
const lang = flag("lang", "fr");
const fps = Number(flag("fps", "2"));
const threshold = Number(flag("threshold", "0.3"));
const steps = new Set(flag("steps", "probe,cuts,sheets,transcribe").split(","));

const r3 = (n) => Math.round(n * 1000) / 1000;
const pad2 = (n) => String(n).padStart(2, "0");
const ffmpeg = (args) => execFileSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args]);

/** `footage:` du frontmatter de BRIEF.md → assets/uploads/<footage>. */
function sourcePath() {
  const explicit = flag("source", null);
  if (explicit) return explicit;
  const brief = join(video, "BRIEF.md");
  const front = existsSync(brief) ? readFileSync(brief, "utf8").match(/^---\r?\n([\s\S]*?)\r?\n---/) : null;
  const name = front?.[1].match(/^footage:\s*["']?(.+?)["']?\s*$/m)?.[1];
  if (!name) throw new Error("BRIEF.md : pas de champ `footage:` dans le frontmatter (ou passe --source <chemin>)");
  const path = join(video, "assets/uploads", name);
  if (!existsSync(path)) throw new Error(`rush introuvable : ${path}`);
  return path;
}

const mapPath = join(video, "footage_map.json");
const map = existsSync(mapPath) ? JSON.parse(readFileSync(mapPath, "utf8")) : { events: [] };
const src = sourcePath();
map.source = { ...map.source, path: relative(video, src) };

function probe() {
  const info = JSON.parse(
    execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,width,height,avg_frame_rate:format=duration", "-of", "json", src], {
      encoding: "utf8",
    }),
  );
  const v = info.streams.find((s) => s.codec_type === "video");
  if (!v) throw new Error(`${src} : aucune piste vidéo`);
  const [num, den] = v.avg_frame_rate.split("/").map(Number);
  map.source = {
    path: relative(video, src),
    width: v.width,
    height: v.height,
    duration_s: r3(Number(info.format.duration)),
    fps: r3(den ? num / den : num),
    has_audio: info.streams.some((s) => s.codec_type === "audio"),
  };
  console.log(`probe : ${v.width}×${v.height}, ${map.source.duration_s} s, ${map.source.fps} i/s, ${map.source.has_audio ? "avec" : "sans"} audio`);
}

function cuts() {
  const log = spawnSync("ffmpeg", ["-hide_banner", "-i", src, "-an", "-vf", `select='gt(scene,${threshold})',showinfo`, "-f", "null", "-"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  }).stderr;
  // Un flash d'une image donne deux coupes rapprochées : on garde la première, un plan dure au moins MIN_SHOT_S.
  const times = [...log.matchAll(/Parsed_showinfo.*pts_time:\s*([\d.]+)/g)]
    .map((m) => Number(m[1]))
    .reduce((kept, t) => (t - (kept.at(-1) ?? 0) >= MIN_SHOT_S && map.source.duration_s - t >= MIN_SHOT_S ? [...kept, t] : kept), []);
  const bounds = [0, ...times, map.source.duration_s];
  const dir = join(video, "footage/frames");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  map.shots = bounds.slice(0, -1).map((start, i) => {
    const end = bounds[i + 1];
    const frame = `footage/frames/shot-${pad2(i + 1)}.jpg`;
    ffmpeg(["-ss", ((start + end) / 2).toFixed(3), "-i", src, "-frames:v", "1", "-q:v", "3", join(video, frame)]);
    return { id: `shot${i + 1}`, start: r3(start), end: r3(end), frame };
  });
  console.log(`cuts : ${map.shots.length} plans (coupes à ${times.map((t) => `${r3(t)} s`).join(", ") || "aucune"})`);
}

/**
 * Planches de `cols`×`rows` tuiles sur [from, to[ : la première image à partir de chaque pas de 1/rate s.
 * Renvoie le chemin et l'horodatage réel (pts) de chaque tuile, lus dans showinfo : rien n'est déduit de l'index.
 */
function contact({ from, to, rate, cols, rows, dir, prefix }) {
  mkdirSync(join(video, dir), { recursive: true });
  const step = 1 / rate;
  // st/ld : compteur de pas ; -0.001 absorbe l'arrondi des pts (25 i/s → 0.04 s).
  const select = `select='if(gte(t\\,${from}+ld(0)*${step}-0.001)\\,st(0\\,ld(0)+1))'`;
  const vf = [select, "showinfo", `scale=${TILE_WIDTH}:-2`, labelFilter(), `tile=${cols}x${rows}:padding=4:color=black`].filter(Boolean).join(",");
  const log = spawnSync(
    "ffmpeg",
    ["-y", "-hide_banner", "-ss", String(from), "-t", String(to - from), "-copyts", "-i", src, "-an", "-vf", vf, "-fps_mode", "passthrough", "-start_number", "1", join(video, dir, `${prefix}-%02d.png`)],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  if (log.status !== 0) throw new Error(`ffmpeg planches : ${log.stderr.slice(-1000)}`);
  const times = [...log.stderr.matchAll(/Parsed_showinfo.*pts_time:\s*([\d.]+)/g)].map((m) => r3(Number(m[1])));
  const per = cols * rows;
  return Array.from({ length: Math.ceil(times.length / per) }, (_, n) => ({
    path: `${dir}/${prefix}-${pad2(n + 1)}.png`,
    cols,
    rows,
    times: times.slice(n * per, (n + 1) * per),
  }));
}

/** drawtext manque aux ffmpeg compilés sans freetype : les tuiles restent alors sans timecode. */
let label;
function labelFilter() {
  if (label !== undefined) return label;
  const filters = spawnSync("ffmpeg", ["-hide_banner", "-filters"], { encoding: "utf8" }).stdout;
  const font = existsSync(FONT) ? `fontfile=${FONT}` : "font=Sans";
  label = /\bdrawtext\b/.test(filters)
    ? `drawtext=${font}:text='%{pts\\:hms}':x=8:y=8:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=4`
    : null;
  return label;
}

function sheets() {
  rmSync(join(video, "footage/sheets"), { recursive: true, force: true });
  map.sheets = contact({ from: 0, to: map.source.duration_s, rate: fps, cols: COLS, rows: ROWS, dir: "footage/sheets", prefix: "sheet" }).map(
    (sheet) => ({ ...sheet, labeled: Boolean(labelFilter()) }),
  );
  const tiles = map.sheets.reduce((sum, s) => sum + s.times.length, 0);
  console.log(`sheets : ${map.sheets.length} planches de ${COLS}×${ROWS}, ${tiles} images, une toutes les ${r3(1 / fps)} s${labelFilter() ? "" : " (sans timecode : drawtext absent)"}`);
}

/** Planche serrée (--refine-fps, 10 par défaut) sur une fenêtre, pour caler au dixième le début ou la fin d'un événement. */
function refine(window) {
  const [a, b] = window.split("-").map(Number);
  if (!(b > a)) throw new Error(`--refine ${window} : attendu <début>-<fin> en secondes, ex. 2.5-3.5`);
  const rate = Number(flag("refine-fps", "10"));
  const count = Math.ceil((b - a) * rate);
  const [sheet] = contact({ from: a, to: b, rate, cols: COLS, rows: Math.ceil(count / COLS), dir: "footage/refine", prefix: `${a}-${b}` });
  const refines = (map.refines ?? []).filter((r) => r.path !== sheet.path);
  map.refines = [...refines, sheet];
  console.log(`refine : ${sheet.path}, ${sheet.times.length} images (${sheet.times.join(" ")} s), ligne par ligne`);
}

function transcribe() {
  if (!map.source.has_audio) {
    map.words = [];
    return console.log("transcribe : pas de piste audio");
  }
  const scratch = mkdtempSync(join(tmpdir(), "studio-footage-"));
  try {
    const wav = join(scratch, "audio.wav");
    ffmpeg(["-i", src, "-vn", "-ac", "1", "-ar", "16000", wav]);
    const out = join(scratch, "out");
    const run = spawnSync(
      "npx",
      ["--yes", HYPERFRAMES, "transcribe", wav, "--engine", "whisper", "--model", "small", "--language", lang, "--dir", out, "--json"],
      { encoding: "utf8" },
    );
    if (run.status !== 0) throw new Error(`transcribe : ${run.stderr.slice(-1000)}`);
    const heard = JSON.parse(readFileSync(join(out, "transcript.json"), "utf8"));
    map.words = heard.map((w, i) => ({ id: `w${i}`, text: w.text, start: r3(w.start), end: r3(w.end) }));
    console.log(`transcribe : ${map.words.length} mots`);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

const refineWindow = flag("refine", null);
if (refineWindow) {
  if (!map.source.duration_s) probe();
  refine(refineWindow);
} else {
  if (steps.has("probe") || !map.source.duration_s) probe();
  if (steps.has("cuts")) cuts();
  if (steps.has("sheets")) sheets();
  if (steps.has("transcribe")) transcribe();
}

const ordered = {
  source: map.source,
  shots: map.shots ?? [],
  sheets: map.sheets ?? [],
  refines: map.refines ?? [],
  words: map.words ?? [],
  events: map.events ?? [],
};
writeFileSync(mapPath, `${JSON.stringify(ordered, null, 2)}\n`);
console.log(`footage_map.json : ${ordered.shots.length} plans, ${ordered.sheets.length} planches, ${ordered.words.length} mots, ${ordered.events.length} événements`);
