#!/usr/bin/env node
// Écrit les entrées du pack fluent-emoji dans workspace/library/catalog.json, depuis le pack installé
// (`pnpm library:fetch`) et les annotations françaises du CLDR (noms et mots-clés), téléchargées à part :
//   https://raw.githubusercontent.com/unicode-org/cldr-json/<commit>/cldr-json/cldr-annotations-full/annotations/fr/annotations.json
//   https://raw.githubusercontent.com/unicode-org/cldr-json/<commit>/cldr-json/cldr-annotations-derived-full/annotationsDerived/fr/annotations.json
//
// Usage, depuis la racine du dépôt :
//   node scripts/library/fluent-emoji.mjs <annotations.json> <annotationsDerived.json>
//
// Une entrée par variante : 3D (PNG 256 px) et plate (SVG). Les emojis à tons de peau ne gardent que leur version
// par défaut, que le lock est seul à télécharger.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const REPO = join(import.meta.dirname, "..", "..");
const LIBRARY = join(REPO, "workspace", "library");
const PACK = "fluent-emoji";
const SOURCE = "https://github.com/microsoft/fluentui-emoji";
const MAX_3D_PX = 320;

const [annotationsPath, derivedPath] = process.argv.slice(2);
if (!annotationsPath || !derivedPath) {
  console.error("usage: node scripts/library/fluent-emoji.mjs <annotations.json> <annotationsDerived.json>");
  process.exit(1);
}
const cldr = {
  ...JSON.parse(readFileSync(derivedPath, "utf8")).annotationsDerived.annotations,
  ...JSON.parse(readFileSync(annotationsPath, "utf8")).annotations.annotations,
};

const GROUPS = {
  "Smileys & Emotion": "visages et émotions",
  "People & Body": "personnes et corps",
  "Animals & Nature": "animaux et nature",
  "Food & Drink": "nourriture et boissons",
  "Travel & Places": "voyages et lieux",
  Activities: "activités",
  Objects: "objets",
  Symbols: "symboles",
  Flags: "drapeaux",
  Component: "composants",
};

/** The French name and keywords of an emoji, with or without its variation selector. */
function french(glyph) {
  for (const key of [glyph, glyph.replace(/️/g, ""), `${glyph}️`]) if (cldr[key]) return cldr[key];
  return null;
}

const slug = (text) =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Width and height of a PNG, from its header. */
function pngSize(path) {
  const header = readFileSync(path).subarray(16, 24);
  return { width: header.readUInt32BE(0), height: header.readUInt32BE(4) };
}

/** The file of a variant: `<emoji>/<variant>/` or, for an emoji with skin tones, `<emoji>/Default/<variant>/`. */
function variantFile(folder, variant, extension) {
  for (const dir of [join(folder, variant), join(folder, "Default", variant)]) {
    if (!existsSync(join(LIBRARY, PACK, "assets", dir))) continue;
    const file = readdirSync(join(LIBRARY, PACK, "assets", dir)).find((name) => name.endsWith(extension));
    if (file) return `${PACK}/assets/${dir}/${file}`;
  }
  return null;
}

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const unique = (values) => [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();

const entries = [];
let withoutFrench = 0;
for (const folder of readdirSync(join(LIBRARY, PACK, "assets")).sort()) {
  const metaPath = join(LIBRARY, PACK, "assets", folder, "metadata.json");
  if (!existsSync(metaPath)) continue;
  const meta = JSON.parse(readFileSync(metaPath, "utf8"));
  const fr = french(meta.glyph);
  if (!fr) withoutFrench++;
  const name = fr?.tts?.[0] ?? meta.tts ?? meta.cldr;
  const group = GROUPS[meta.group] ?? "";
  const kind = meta.group === "Flags" ? "flag" : "object";
  const tagsFr = unique([name, ...(fr?.default ?? []), group, "emoji"]);
  const tagsEn = unique([meta.cldr, meta.tts ?? "", ...(meta.keywords ?? []), ...(meta.glyphAsUtfInEmoticons ?? []), meta.group ?? "", "emoji"]);
  const id = slug(folder);

  const threeD = variantFile(folder, "3D", ".png");
  if (threeD) {
    entries.push({
      id: `emoji-3d-${id}`,
      kind,
      title: `${capitalize(name)} (emoji 3D)`,
      tags: { fr: unique([...tagsFr, "3d", "relief"]), en: unique([...tagsEn, "3d"]) },
      useWhen: `Emoji 3D « ${name} » ${meta.glyph} : un petit objet ou symbole en relief pour illustrer une idée, une liste, une réaction. ${MAX_3D_PX} px au plus à l'écran.`,
      avoidFor: `Un grand visuel : au-delà de ${MAX_3D_PX} px l'image devient floue, prends la version plate. Garde un seul style d'emoji par vidéo.`,
      file: threeD,
      format: "png",
      dimensions: pngSize(join(LIBRARY, threeD)),
      pack: PACK,
      license: "MIT",
      source: SOURCE,
      author: "Microsoft",
    });
  }
  const flat = variantFile(folder, "Flat", ".svg");
  if (flat) {
    entries.push({
      id: `emoji-plat-${id}`,
      kind,
      title: `${capitalize(name)} (emoji plat)`,
      tags: { fr: unique([...tagsFr, "plat", "vectoriel"]), en: unique([...tagsEn, "flat", "vector"]) },
      useWhen: `Emoji plat « ${name} » ${meta.glyph}, vectoriel : net à toute taille, pour une icône illustrée ou un grand visuel simple.`,
      avoidFor: "Une vidéo qui utilise déjà les emojis 3D : garde un seul style d'emoji par vidéo.",
      file: flat,
      format: "svg",
      pack: PACK,
      license: "MIT",
      source: SOURCE,
      author: "Microsoft",
    });
  }
}

const catalogPath = join(LIBRARY, "catalog.json");
const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
catalog.entries = [...catalog.entries.filter((entry) => entry.pack !== PACK), ...entries];
writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`${entries.length} entrées fluent-emoji, ${withoutFrench} emoji(s) sans nom français (nom anglais gardé).`);
