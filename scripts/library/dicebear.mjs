#!/usr/bin/env node
// Génère les avatars DiceBear de la bibliothèque dans vendor/library/dicebear/ (source « local » du lock), puis
// écrit leurs entrées dans workspace/library/catalog.json. Seuls les styles sous CC0 sont admis : le script échoue
// si un style retenu a une autre licence. Les avatars ne dépendent que de la version, du style et de la graine.
//
// Usage, depuis la racine du dépôt, avec DiceBear installé à part :
//   npm install --prefix <dossier> --ignore-scripts @dicebear/core@9.4.3 @dicebear/collection@9.4.3
//   node scripts/library/dicebear.mjs <dossier>
// Puis `pnpm library:fetch` donne la nouvelle empreinte du pack, à reporter dans library.lock.json.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const VERSION = "9.4.3";
const SEEDS = 24;
/** Styles that show a face, under CC0: the abstract ones (identicon, rings, shapes, glass) and initials are left out. */
const STYLES = {
  lorelei: { title: "visage dessiné au trait, style illustration", tagsFr: ["illustration", "trait"], tagsEn: ["illustration", "line art"] },
  notionists: { title: "visage au trait noir, style Notion", tagsFr: ["trait", "noir et blanc"], tagsEn: ["line art", "black and white"] },
  openPeeps: { title: "visage Open Peeps dessiné à la main", tagsFr: ["dessin", "noir et blanc"], tagsEn: ["hand-drawn", "black and white"] },
  pixelArt: { title: "visage en pixel art", tagsFr: ["pixel art", "rétro", "jeu vidéo"], tagsEn: ["pixel art", "retro", "video game"] },
  thumbs: { title: "pastille colorée minimaliste avec un visage", tagsFr: ["minimaliste", "couleur"], tagsEn: ["minimal", "colorful"] },
};

const installed = process.argv[2];
if (!installed) {
  console.error("usage: node scripts/library/dicebear.mjs <dossier où @dicebear/collection est installé>");
  process.exit(1);
}
const REPO = join(import.meta.dirname, "..", "..");
const OUT = join(REPO, "vendor", "library", "dicebear");
const require = createRequire(join(installed, "package.json"));
const core = await import(require.resolve("@dicebear/core"));
const collection = await import(require.resolve("@dicebear/collection"));
const found = JSON.parse(readFileSync(join(installed, "node_modules", "@dicebear", "collection", "package.json"), "utf8")).version;
if (found !== VERSION) throw new Error(`@dicebear/collection ${found} installé, ${VERSION} attendu`);

const kebab = (name) => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
rmSync(OUT, { recursive: true, force: true });
const manifest = { generator: "scripts/library/dicebear.mjs", dicebear: VERSION, seeds: SEEDS, styles: {} };
const entries = [];
for (const [name, info] of Object.entries(STYLES)) {
  const style = collection[name];
  const license = style.meta?.license?.name;
  if (license !== "CC0 1.0") throw new Error(`${name} : licence « ${license} », seule CC0 1.0 est admise`);
  const folder = kebab(name);
  mkdirSync(join(OUT, folder), { recursive: true });
  manifest.styles[folder] = { license, creator: style.meta.creator, source: style.meta.source };
  for (let n = 1; n <= SEEDS; n++) {
    const file = `${folder}/avatar-${n}.svg`;
    writeFileSync(join(OUT, file), core.createAvatar(style, { seed: `framesmith-${n}` }).toString());
    entries.push({
      id: `avatar-${folder}-${n}`,
      kind: "avatar",
      title: `Avatar ${n} : ${info.title} (DiceBear ${folder})`,
      tags: {
        fr: ["avatar", "profil", "utilisateur", "personne", "photo de profil", ...info.tagsFr].sort(),
        en: ["avatar", "profile", "user", "person", "profile picture", folder, ...info.tagsEn].sort(),
      },
      useWhen: `Photo de profil générée, ${info.title}, carrée : pour un commentaire, un témoignage, une liste d'utilisateurs, un message. Prends plusieurs avatars du même style dans une vidéo.${name === "pixelArt" ? " Affiche-le avec image-rendering: pixelated, sinon il devient flou en grand." : ""}`,
      avoidFor: "Une vraie personne nommée : un avatar généré ne la représente pas. Son expression est tirée au hasard (certains grimacent) : regarde-le avant de le choisir. Ne mélange pas les styles d'avatar.",
      file: `dicebear/${file}`,
      format: "svg",
      pack: "dicebear",
      license: "CC0-1.0",
      source: style.meta.source,
      author: `${style.meta.creator} (DiceBear)`,
    });
  }
}
writeFileSync(join(OUT, "avatars.json"), `${JSON.stringify(manifest, null, 2)}\n`);

const catalogPath = join(REPO, "workspace", "library", "catalog.json");
const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
catalog.entries = [...catalog.entries.filter((entry) => entry.pack !== "dicebear"), ...entries];
writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`${entries.length} avatars, ${Object.keys(STYLES).length} styles CC0.`);
