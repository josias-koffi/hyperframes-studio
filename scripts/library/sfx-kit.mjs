#!/usr/bin/env node
// Écrit les entrées du pack sfx-kit dans workspace/library/catalog.json depuis son sounds.json (pack installé par
// `pnpm library:fetch`). Garde ce qui place un son : durée, point de synchro, moment visé, niveau sous la voix,
// usages et cas à éviter. Chaque WAV est vérifié contre l'empreinte que sounds.json annonce.
//
// Usage, depuis la racine du dépôt :
//   node scripts/library/sfx-kit.mjs
//
// Les whooshes, swishes et reverse whooshes ne sont pas livrés (le lock les exclut) : aucun whoosh dans une vidéo.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const REPO = join(import.meta.dirname, "..", "..");
const LIBRARY = join(REPO, "workspace", "library");
const PACK = "sfx-kit";

const CATEGORIES = {
  swipes: "Glissement de doigt", "risers-and-fallers": "Montée ou descente", "bounce-spin-zoom": "Rebond, rotation, zoom",
  impacts: "Impact", "cinematic-hits": "Frappe cinématique", "booms-and-bass": "Boum et basses", pops: "Pop",
  "appear-and-vanish": "Apparition ou disparition", "shape-changes": "Forme qui change", interface: "Interface",
  keyboard: "Clavier", "writing-and-drawing": "Écriture et dessin", phone: "Téléphone", mechanical: "Mécanique",
  foley: "Bruitage d'objet", "everyday-props": "Objet du quotidien", notifications: "Notification", tones: "Note",
  shimmers: "Scintillement", "logo-stings": "Signature de logo", celebration: "Célébration", time: "Temps",
  money: "Argent", digital: "Numérique", data: "Données",
};

/** French tags for the words of the names and tags that say what the sound is. */
const WORDS = {
  alarm: "alarme", alert: "alerte", applause: "applaudissements", attention: "attention", ball: "balle", bass: "basse",
  bell: "cloche", big: "gros", book: "livre", boom: "boum", box: "boîte", bubble: "bulle", burst: "éclat", button: "bouton",
  card: "carte", cash: "espèces", chalk: "craie", chart: "graphique", chime: "carillon", clap: "claquement", click: "clic",
  clock: "horloge", coin: "pièce", coins: "pièces", confetti: "confettis", count: "compte", countdown: "compte à rebours",
  counting: "comptage", crowd: "foule", data: "données", denied: "refusé", ding: "ding", door: "porte", doorbell: "sonnette",
  drawing: "dessin", drop: "chute", drum: "tambour", error: "erreur", eraser: "gomme", fabric: "tissu", failure: "échec",
  fanfare: "fanfare", firework: "feu d'artifice", glass: "verre", glitch: "bug", hit: "frappe", impact: "impact",
  key: "touche", keypad: "pavé numérique", knock: "toc", landing: "atterrissage", letter: "lettre", lock: "verrou",
  logo: "logo", marker: "feutre", message: "message", metal: "métal", mouse: "souris", notes: "notes", number: "nombre",
  page: "page", paper: "papier", party: "fête", payment: "paiement", pen: "stylo", pencil: "crayon", phone: "téléphone",
  plastic: "plastique", pop: "pop", popper: "cotillon", progress: "progression", register: "caisse", reveal: "révélation",
  ring: "sonnerie", ringtone: "sonnerie", riser: "montée", scan: "scan", scissors: "ciseaux", scribble: "gribouillis",
  security: "sécurité", sent: "envoyé", shimmer: "scintillement", shutter: "obturateur", slam: "claquement", slide: "glisse",
  snap: "claquement", sparkle: "étincelle", spin: "rotation", splash: "éclaboussure", spring: "ressort", static: "parasites",
  stopwatch: "chronomètre", success: "succès", swipe: "glissement", switch: "interrupteur", tap: "tapotement",
  tape: "ruban adhésif", thud: "bruit sourd", tick: "tic", ticking: "tic-tac", timer: "minuteur", toggle: "bascule",
  typing: "frappe au clavier", vibrating: "vibreur", whiteboard: "tableau blanc", wood: "bois", writing: "écriture",
  zip: "fermeture éclair", zoom: "zoom",
};

const unique = (values) => [...new Set(values.filter(Boolean).map((value) => value.trim()))].sort();
const sentence = (items) => items.map((item) => item.replace(/\.$/, "")).join(" ; ");

const kit = JSON.parse(readFileSync(join(LIBRARY, PACK, "sounds.json"), "utf8"));
const entries = [];
for (const sound of kit.sounds) {
  const path = join(LIBRARY, PACK, sound.file);
  if (!existsSync(path)) continue; // A whoosh, left out by the lock.
  const actual = createHash("sha256").update(readFileSync(path)).digest("hex");
  if (actual !== sound.sha256) throw new Error(`${sound.file} : sha256 ${actual}, sounds.json annonce ${sound.sha256}`);
  const words = [...sound.name.toLowerCase().matchAll(/[a-z]+/g), ...sound.tags.join(" ").toLowerCase().matchAll(/[a-z]+/g)].map((match) => match[0]);
  const category = CATEGORIES[sound.category] ?? sound.category;
  entries.push({
    id: `sfx-${sound.id}`,
    kind: "sound",
    title: `${category} : ${sound.name}`,
    tags: { fr: unique(["bruitage", "son", category.toLowerCase(), ...words.map((word) => WORDS[word])]), en: unique(["sound effect", "sfx", sound.category, ...sound.tags]) },
    useWhen: `${sound.description} Pour : ${sentence(sound.use_for)}. Synchro : ${sound.sync.how}`,
    avoidFor: `${sentence(sound.avoid_for)}. Jamais sur l'entrée ou la sortie d'un élément, jamais en transition.`,
    file: `${PACK}/${sound.file}`,
    format: "wav",
    sound: {
      duration: sound.duration,
      syncAt: sound.sync.at,
      meets: sound.sync.meets,
      underVoiceoverDb: sound.under_voiceover_db,
      ...(sound.fits_seconds ? { fitsSeconds: sound.fits_seconds } : {}),
    },
    pack: PACK,
    license: "CC0-1.0",
    source: kit.homepage ?? "https://github.com/wyzowl/sfx-kit",
    author: "Wyzowl",
  });
}

const catalogPath = join(LIBRARY, "catalog.json");
const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
catalog.entries = [...catalog.entries.filter((entry) => entry.pack !== PACK), ...entries];
writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`${entries.length} sons sfx-kit, empreintes conformes à sounds.json.`);
