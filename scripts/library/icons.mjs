#!/usr/bin/env node
// Écrit les entrées des packs lucide, phosphor et flag-icons dans workspace/library/catalog.json, depuis les packs
// installés (`pnpm library:fetch`) et trois fichiers du CLDR téléchargés à part (même commit que fluent-emoji.mjs) :
//   cldr-annotations-full/annotations/en/annotations.json   noms anglais des emojis
//   cldr-annotations-full/annotations/fr/annotations.json   noms français des emojis
//   cldr-localenames-full/main/fr/territories.json          noms français des pays
//
// Usage, depuis la racine du dépôt :
//   node scripts/library/icons.mjs <en/annotations.json> <fr/annotations.json> <fr/territories.json>
//
// Les tags des icônes sont en anglais : leurs mots sont traduits quand un emoji porte ce nom dans les deux langues
// (« rocket » → « fusée »), et leur catégorie l'est toujours. Les logos de marque sont écartés.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const REPO = join(import.meta.dirname, "..", "..");
const LIBRARY = join(REPO, "workspace", "library");

const [enPath, frPath, territoriesPath] = process.argv.slice(2);
if (!enPath || !frPath || !territoriesPath) {
  console.error("usage: node scripts/library/icons.mjs <en/annotations.json> <fr/annotations.json> <fr/territories.json>");
  process.exit(1);
}
const en = JSON.parse(readFileSync(enPath, "utf8")).annotations.annotations;
const fr = JSON.parse(readFileSync(frPath, "utf8")).annotations.annotations;
const territories = JSON.parse(readFileSync(territoriesPath, "utf8")).main.fr.localeDisplayNames.territories;

/** English word → French name, from the emojis whose English name is that one word. */
const dictionary = new Map();
for (const [glyph, names] of Object.entries(en)) {
  const english = names.tts?.[0];
  const french = fr[glyph]?.tts?.[0];
  if (english && french && /^[a-z]+$/.test(english) && !dictionary.has(english)) dictionary.set(english, french);
}

const unique = (values) => [...new Set(values.filter((value) => value != null).map((value) => String(value).trim()).filter(Boolean))].sort();
const words = (name) => name.split(/[-_\s]+/).filter(Boolean);
const translate = (name) => unique(words(name).map((word) => dictionary.get(word) ?? dictionary.get(word.replace(/s$/, ""))));
const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

const LUCIDE_CATEGORIES = {
  accessibility: "accessibilité", account: "compte", animals: "animaux", arrows: "flèches", buildings: "bâtiments", charts: "graphiques",
  communication: "communication", connectivity: "connexion", cursors: "curseurs", design: "design", development: "développement",
  devices: "appareils", emoji: "émoticônes", files: "fichiers", finance: "finance", "food-beverage": "nourriture et boissons",
  gaming: "jeux", home: "maison", layout: "mise en page", "letters-digits": "lettres et chiffres", mail: "courrier", math: "mathématiques",
  medical: "santé", multimedia: "multimédia", nature: "nature", navigation: "navigation", notifications: "notifications", people: "personnes",
  photography: "photo", science: "science", seasons: "saisons", security: "sécurité", shapes: "formes", shopping: "achats",
  social: "réseaux sociaux", sports: "sport", sustainability: "écologie", text: "texte", time: "temps", tools: "outils",
  transportation: "transport", travel: "voyage", weather: "météo",
};
const PHOSPHOR_CATEGORIES = {
  ARROWS: "flèches", COMMERCE: "commerce", COMMUNICATION: "communication", DESIGN: "design", DEVELOPMENT: "développement",
  EDITOR: "édition", FINANCE: "finance", GAMES: "jeux", HEALTH: "santé", MAP: "carte", MEDIA: "médias", NATURE: "nature",
  OBJECTS: "objets", OFFICE: "bureau", PEOPLE: "personnes", SYSTEM: "système", WEATHER: "météo",
};

function icon({ pack, id, name, source, author, license, file, tagsEn, categoriesFr, style }) {
  const french = translate(name);
  return {
    id,
    kind: "icon",
    title: `Icône ${french.length ? `${french.join(", ")} (${name})` : name} — ${style}`,
    tags: { fr: unique(["icône", "pictogramme", ...french, ...categoriesFr]), en: unique(["icon", ...words(name), ...tagsEn]) },
    useWhen: `Icône ${style}, d'une seule couleur : teinte-la avec --color #RRGGBB. Pour illustrer une liste, une étape, un bouton, une caractéristique.`,
    avoidFor: "Le visuel principal d'une scène : une icône appuie une idée. Garde un seul jeu d'icônes par vidéo.",
    file,
    format: "svg",
    pack,
    license,
    source,
    author,
  };
}

const entries = { lucide: [], phosphor: [], "flag-icons": [] };

// Lucide: icons/<name>.svg and its <name>.json (tags, categories), deprecated ones left out.
for (const file of readdirSync(join(LIBRARY, "lucide", "icons")).filter((name) => name.endsWith(".json")).sort()) {
  const name = file.slice(0, -5);
  const meta = JSON.parse(readFileSync(join(LIBRARY, "lucide", "icons", file), "utf8"));
  if (meta.deprecated || !existsSync(join(LIBRARY, "lucide", "icons", `${name}.svg`))) continue;
  entries.lucide.push(
    icon({
      pack: "lucide",
      id: `lucide-${name}`,
      name,
      source: `https://lucide.dev/icons/${name}`,
      author: "Lucide",
      license: "ISC",
      file: `lucide/icons/${name}.svg`,
      tagsEn: [...(meta.tags ?? []), ...(meta.categories ?? [])],
      categoriesFr: (meta.categories ?? []).map((category) => LUCIDE_CATEGORIES[category]),
      style: "au trait (Lucide)",
    }),
  );
}

// Phosphor: the regular weight, tags and categories from src/icons.ts; logos left out (the lock does not ship them).
const phosphorSource = readFileSync(join(LIBRARY, "phosphor", "src", "icons.ts"), "utf8");
for (const [, name, categories, tags] of phosphorSource.matchAll(/\{\s*name: "([a-z0-9-]+)",[^{}]*?categories: \[([^\]]*)\][^{}]*?tags: \[([^\]]*)\]/g)) {
  if (name.includes("logo") || !existsSync(join(LIBRARY, "phosphor", "assets", "regular", `${name}.svg`))) continue;
  const categoryNames = [...categories.matchAll(/IconCategory\.([A-Z_]+)/g)].map((match) => match[1]);
  entries.phosphor.push(
    icon({
      pack: "phosphor",
      id: `phosphor-${name}`,
      name,
      source: `https://phosphoricons.com/?q=${name}`,
      author: "Phosphor Icons",
      license: "MIT",
      file: `phosphor/assets/regular/${name}.svg`,
      tagsEn: [...tags.matchAll(/"([^"*]+)"/g)].map((match) => match[1]).concat(categoryNames.map((category) => category.toLowerCase())),
      categoriesFr: categoryNames.map((category) => PHOSPHOR_CATEGORIES[category]),
      style: "au trait arrondi (Phosphor)",
    }),
  );
}

// flag-icons: the 4:3 flags, French names from the CLDR, and these the CLDR does not name.
const OTHER_FLAGS = {
  "gb-eng": "Angleterre", "gb-sct": "Écosse", "gb-wls": "Pays de Galles", "gb-nir": "Irlande du Nord", "es-ct": "Catalogne",
  "es-ga": "Galice", "es-pv": "Pays basque", arab: "Ligue arabe", asean: "ASEAN", cefta: "ALECE (CEFTA)",
  eac: "Communauté d'Afrique de l'Est", pc: "Communauté du Pacifique", "sh-ac": "Île de l'Ascension", "sh-hl": "Sainte-Hélène",
  "sh-ta": "Tristan da Cunha",
};
const CONTINENTS = { Africa: "Afrique", Asia: "Asie", Europe: "Europe", "North America": "Amérique du Nord", "South America": "Amérique du Sud", Oceania: "Océanie", Antarctica: "Antarctique" };
for (const country of JSON.parse(readFileSync(join(LIBRARY, "flag-icons", "country.json"), "utf8"))) {
  const { code } = country;
  const name = OTHER_FLAGS[code] ?? territories[code.toUpperCase()];
  // xx is the « unknown flag » placeholder.
  if (!name || code === "xx" || !existsSync(join(LIBRARY, "flag-icons", "flags", "4x3", `${code}.svg`))) continue;
  const continent = CONTINENTS[country.continent];
  entries["flag-icons"].push({
    id: `drapeau-${code}`,
    kind: "flag",
    title: `Drapeau : ${capitalize(name)}`,
    tags: { fr: unique(["drapeau", "pays", name, code, continent ?? ""]), en: unique(["flag", "country", country.name, code, country.continent ?? ""]) },
    useWhen: `Drapeau ${country.iso ? `de ${name} (code ISO ${code.toUpperCase()})` : `: ${name}`}, au format 4:3, vectoriel. Pour un pays, une langue, un marché, une équipe.`,
    avoidFor: "Désigner une langue par un seul drapeau quand plusieurs pays la parlent : préfère le nom de la langue.",
    file: `flag-icons/flags/4x3/${code}.svg`,
    format: "svg",
    pack: "flag-icons",
    license: "MIT",
    source: "https://flagicons.lipis.dev/",
    author: "Panayiotis Lipiridis et contributeurs",
  });
}

const catalogPath = join(LIBRARY, "catalog.json");
const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
const packs = new Set(Object.keys(entries));
catalog.entries = [...catalog.entries.filter((entry) => !packs.has(entry.pack)), ...Object.values(entries).flat()];
writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
for (const [pack, list] of Object.entries(entries)) {
  const translated = list.filter((entry) => entry.kind === "icon" && / \(.+\) — /.test(entry.title)).length;
  console.log(`${pack} : ${list.length} entrées${pack === "flag-icons" ? "" : `, ${translated} avec un nom traduit`}.`);
}
console.log(`Dictionnaire : ${dictionary.size} mots.`);
