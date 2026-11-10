#!/usr/bin/env node
// Bibliothèque d'assets libres (library/catalog.json) : personnages, objets, icônes, drapeaux, appareils, bruitages…
// Cherche avant de dessiner ; ajoute à la vidéo ce que tu utilises, avec son crédit.
//
// Usage, depuis la racine du workspace (sans réseau) :
//   node scripts/library.mjs search "<mots en français ou en anglais>" [--kind <type>] [--format svg,png] [--limit 10] [--json]
//   node scripts/library.mjs add <id> videos/<nom> [--color #RRGGBB] [--json]
//   node scripts/library.mjs get <id> [<id>…]          → les entrées du catalogue en JSON, ids inconnus omis
//
// search  liste les assets les plus proches, du meilleur au moins bon, toujours dans le même ordre. Sans résultat, le
//         dit : la bibliothèque n'a rien pour ça, note le manque avant de dessiner.
// add     copie le fichier dans videos/<nom>/assets/library/<pack>/ et complète videos/<nom>/assets/library/CREDITS.json.
//         --color teint un SVG d'une seule couleur (icônes). Relancer la même commande ne duplique rien.
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const LIBRARY = resolve(process.env.STUDIO_LIBRARY_DIR ?? join(dirname(fileURLToPath(import.meta.url)), "..", "library"));
const WORKSPACE = dirname(LIBRARY);
const KINDS = ["character", "object", "icon", "flag", "illustration", "avatar", "map", "sound", "device", "component", "transition"];

/** Words that say nothing about what an asset shows. */
const STOPWORDS = new Set(
  ("le la les un une des de du d l et ou au aux en pour sur avec sans dans par a à qui que se son sa ses " +
    "the an of and or with without in on for to by at is")
    .split(" "),
);

const argv = process.argv.slice(2);
const [command, ...rest] = argv;
const flag = (name, fallback) => {
  const index = rest.indexOf(`--${name}`);
  return index >= 0 && index + 1 < rest.length ? rest[index + 1] : fallback;
};
const positional = rest.filter((arg, index) => !arg.startsWith("--") && !(index > 0 && rest[index - 1].startsWith("--") && rest[index - 1] !== "--json"));

function fail(message) {
  console.error(message);
  process.exit(1);
}

function loadCatalog() {
  const path = join(LIBRARY, "catalog.json");
  if (!existsSync(path)) fail(`Bibliothèque absente : ${relative(process.cwd(), path) || path}`);
  return JSON.parse(readFileSync(path, "utf8")).entries;
}

/** Lower case, no accents, singular when a plural is obvious: « Téléphones » finds « telephone ». */
function words(text) {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word && !STOPWORDS.has(word))
    .map((word) => (word.length > 3 && /[sx]$/.test(word) && !/ss$/.test(word) ? word.slice(0, -1) : word));
}

/**
 * Each word of the query scores on the best place it is found: a tag (3), the title or the id (2), the start of a
 * longer word (1). More words found first, then the score, then the id: the same query gives the same list.
 */
function search(entries, query, kind, formats) {
  const asked = [...new Set(words(query))];
  const scored = [];
  for (const entry of entries) {
    if (kind && entry.kind !== kind) continue;
    if (formats && !formats.includes(entry.format)) continue;
    if (asked.length === 0) {
      scored.push({ entry, found: 0, score: 0 });
      continue;
    }
    const tags = new Set([...entry.tags.fr, ...entry.tags.en].flatMap(words));
    const named = new Set([...words(entry.title), ...words(entry.id)]);
    const all = [...tags, ...named];
    let found = 0;
    let score = 0;
    for (const word of asked) {
      const points = tags.has(word) ? 3 : named.has(word) ? 2 : word.length >= 3 && all.some((known) => known.length > word.length && known.startsWith(word)) ? 1 : 0;
      if (points > 0) found += 1;
      score += points;
    }
    if (found > 0) scored.push({ entry, found, score });
  }
  return scored
    .sort((a, b) => b.found - a.found || b.score - a.score || (a.entry.id < b.entry.id ? -1 : a.entry.id > b.entry.id ? 1 : 0))
    .map(({ entry }) => entry);
}

function describe(entry) {
  const size = entry.dimensions ? `, ${entry.dimensions.width}×${entry.dimensions.height} px` : "";
  const lines = [`${entry.id}  [${entry.kind}]  ${entry.title}`, `    fichier : ${entry.file} (${entry.format}${size}) · ${entry.license}, ${entry.author}`, `    pour : ${entry.useWhen}`];
  if (entry.avoidFor) lines.push(`    éviter : ${entry.avoidFor}`);
  return lines.join("\n");
}

function runSearch() {
  const query = positional[0] ?? "";
  const kind = flag("kind", null);
  if (kind && !KINDS.includes(kind)) fail(`--kind inconnu : ${kind}. Types : ${KINDS.join(", ")}`);
  const limit = Number(flag("limit", "10"));
  if (!Number.isInteger(limit) || limit < 1) fail("--limit attend un entier positif");
  if (!query.trim() && !kind) fail('usage: node scripts/library.mjs search "<mots>" [--kind <type>] [--limit 10] [--json]');
  const formats = flag("format", null)?.split(",") ?? null;
  const found = search(loadCatalog(), query, kind, formats).slice(0, limit);
  if (rest.includes("--json")) {
    console.log(JSON.stringify(found, null, 2));
    return;
  }
  if (found.length === 0) {
    const scope = kind ? ` parmi les ${kind}` : "";
    console.log(`AUCUN RÉSULTAT pour « ${query} »${scope} : la bibliothèque n'a rien pour ça.`);
    console.log("Essaie un synonyme ou l'anglais, puis le registre (/hyperframes-registry). Si rien ne convient, note le manque avant de dessiner.");
    return;
  }
  console.log(found.map(describe).join("\n\n"));
  console.log(`\n${found.length} résultat(s). Ajoute un asset à la vidéo : node scripts/library.mjs add <id> videos/<nom>`);
}

/** The colours a SVG paints with, `currentColor` included; none and transparent leave nothing on screen. */
function svgColours(svg) {
  const found = new Set();
  const pattern = /(?:fill|stroke|stop-color|color)\s*[:=]\s*["']?\s*(#[0-9a-fA-F]{3,8}|currentColor|[a-zA-Z]+(?:\([^)]*\))?)/g;
  for (const match of svg.matchAll(pattern)) {
    const colour = match[1].toLowerCase();
    if (!["none", "transparent", "inherit"].includes(colour) && !colour.startsWith("url")) found.add(colour);
  }
  return found;
}

/** Repaints a single-colour SVG; refuses one with several colours, which a tint would flatten. */
function tint(svg, colour, id) {
  const colours = svgColours(svg);
  if (colours.size === 0) return svg.replace(/<svg\b/, `<svg fill="${colour}"`);
  if (colours.size > 1) fail(`--color ne s'applique qu'à un SVG d'une seule couleur ; ${id} en a ${colours.size} (${[...colours].join(", ")}).`);
  const [only] = colours;
  const escaped = only.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return svg.replace(new RegExp(`((?:fill|stroke|stop-color|color)\\s*[:=]\\s*["']?\\s*)${escaped}`, "gi"), `$1${colour}`);
}

function runAdd() {
  const [id, video] = positional;
  if (!id || !video) fail("usage: node scripts/library.mjs add <id> videos/<nom> [--color #RRGGBB]");
  const videoDir = resolve(video);
  if (!videoDir.startsWith(join(WORKSPACE, "videos") + sep) || !existsSync(videoDir) || !statSync(videoDir).isDirectory()) {
    fail(`${video} : dossier de vidéo introuvable (attendu : videos/<nom>, depuis la racine du workspace)`);
  }
  const entry = loadCatalog().find((candidate) => candidate.id === id);
  if (!entry) fail(`Asset inconnu : ${id}. Cherche son id avec : node scripts/library.mjs search "<mots>"`);
  if (entry.file.split("/").some((segment) => segment === ".." || segment === "") || entry.file.includes("\\")) fail(`${id} : chemin invalide`);

  const colour = flag("color", null);
  if (colour !== null && !/^#[0-9a-fA-F]{6}$/.test(colour)) fail("--color attend une couleur #RRGGBB");
  if (colour !== null && entry.format !== "svg") fail(`--color ne s'applique qu'à un SVG ; ${id} est en ${entry.format}.`);

  const source = join(LIBRARY, entry.file);
  if (!existsSync(source)) fail(`${id} : fichier absent de la bibliothèque (${entry.file})`);
  const name = colour ? entry.file.replace(/\.svg$/, `-${colour.slice(1).toLowerCase()}.svg`) : entry.file;
  const target = join(videoDir, "assets", "library", name);
  mkdirSync(dirname(target), { recursive: true });
  if (colour) {
    const tinted = tint(readFileSync(source, "utf8"), colour.toLowerCase(), id);
    if (!existsSync(target) || readFileSync(target, "utf8") !== tinted) writeFileSync(target, tinted);
  } else if (!existsSync(target) || !readFileSync(target).equals(readFileSync(source))) {
    copyFileSync(source, target);
  }

  const file = relative(videoDir, target).split(sep).join("/");
  const creditsPath = join(videoDir, "assets", "library", "CREDITS.json");
  const credits = existsSync(creditsPath) ? JSON.parse(readFileSync(creditsPath, "utf8")) : { version: 1, assets: [] };
  const credit = { file, id: entry.id, title: entry.title, pack: entry.pack, license: entry.license, author: entry.author, source: entry.source };
  credits.assets = [...credits.assets.filter((known) => known.file !== file), credit].sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
  writeFileSync(creditsPath, `${JSON.stringify(credits, null, 2)}\n`);

  if (rest.includes("--json")) {
    console.log(JSON.stringify({ file, id: entry.id }));
    return;
  }
  const size = entry.dimensions ? ` (${entry.dimensions.width}×${entry.dimensions.height} px, ne l'affiche pas plus grand)` : "";
  console.log(`${file}${size}`);
  console.log(`Utilise ce chemin depuis videos/${relative(join(WORKSPACE, "videos"), videoDir).split(sep).join("/")}/index.html. Crédit ajouté à assets/library/CREDITS.json.`);
}

function runGet() {
  const wanted = new Set(positional);
  console.log(JSON.stringify(loadCatalog().filter((entry) => wanted.has(entry.id)), null, 2));
}

if (command === "search") runSearch();
else if (command === "get") runGet();
else if (command === "add") runAdd();
else fail('usage: node scripts/library.mjs search "<mots>" [--kind <type>] [--limit 10] [--json]\n       node scripts/library.mjs add <id> videos/<nom> [--color #RRGGBB]');
