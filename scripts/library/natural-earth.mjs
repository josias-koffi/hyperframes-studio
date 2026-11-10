#!/usr/bin/env node
// Génère les cartes Natural Earth de la bibliothèque dans vendor/library/natural-earth/ (source « local » du lock),
// puis écrit leurs entrées dans workspace/library/catalog.json : le monde, six continents et une carte par pays,
// chaque pays étant un <path> dont l'id est son code ISO à trois lettres.
//
// Usage, depuis la racine du dépôt :
//   npm install --prefix <d3> --ignore-scripts d3-geo@3.1.1 topojson-server@3.0.1 topojson-simplify@3.0.3 topojson-client@3.1.0
//   node scripts/library/natural-earth.mjs <d3> <dossier des GeoJSON>
// Le dossier contient geojson/ne_10m_admin_0_countries_fra.geojson, téléchargé au commit NE_COMMIT de
// nvkelso/natural-earth-vector. Puis `pnpm library:fetch` donne la nouvelle empreinte du pack, à reporter dans
// library.lock.json.
//
// Frontières : la vue « France » de Natural Earth (position officielle française), choisie pour un studio
// francophone (ADR-008) : la Crimée est ukrainienne ; Somaliland, Chypre du Nord et le Sahara occidental sont
// fondus dans la Somalie, Chypre et le Maroc ; la partie du Golan tenue par Israël n'appartient à aucun État. Elle
// n'existe qu'au 1:10m : les tracés sont simplifiés en topologie, les frontières communes restant identiques.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const NE_COMMIT = "ca96624a56bd078437bca8184e78163e5039ad19";
const INPUT = "ne_10m_admin_0_countries_fra.geojson";
const INPUT_SHA256 = "273def0394f5e344ff4938b1cbe9c48f36aea2e8e1635a8814768bc50f5dd44c";
/** Curiosities of the 1:10m data, no use in a video: a leased base, unclaimed land, reefs. */
const LEFT_OUT = new Set(["USG", "BRT", "BRI", "PGA", "SCR"]);
/** What the French view changes on a country's map, said in its entry. */
const VIEW_NOTES = {
  UKR: "La Crimée y est incluse.",
  MAR: "Le Sahara occidental y est inclus.",
  SOM: "Le Somaliland y est inclus.",
  CYP: "Le nord de l'île y est inclus.",
  SYR: "La partie du Golan tenue par Israël n'y est pas.",
  ISR: "Le Golan n'y est pas.",
};
/**
 * Each map keeps the points that make a difference at its own size: a point goes when its triangle covers less than
 * this many square pixels once the area the map shows fills its frame.
 */
const MIN_PIXELS = 0.5;
/** Parts of a country farther than this from its largest one are left out of its own map (overseas, Alaska…). */
const MAIN_PART_KM = 2500;
const LAND = "#D9DEE5";
const HIGHLIGHT = "#8A97A8";
const BORDER = "#FFFFFF";

const CONTINENTS = {
  europe: { name: "Europe", fr: "Europe", box: [-25, 34, 45, 71] },
  afrique: { name: "Africa", fr: "Afrique", box: [-20, -36, 55, 38] },
  asie: { name: "Asia", fr: "Asie", box: [25, -12, 150, 60] },
  "amerique-du-nord": { name: "North America", fr: "Amérique du Nord", box: [-170, 7, -50, 75] },
  "amerique-du-sud": { name: "South America", fr: "Amérique du Sud", box: [-82, -56, -34, 13] },
  oceanie: { name: "Oceania", fr: "Océanie", box: [110, -48, 180, 0] },
};
const CONTINENT_FR = Object.fromEntries(Object.values(CONTINENTS).map((continent) => [continent.name, continent.fr]));

const [d3Dir, dataDir] = process.argv.slice(2);
if (!d3Dir || !dataDir) {
  console.error("usage: node scripts/library/natural-earth.mjs <dossier où d3-geo est installé> <dossier des GeoJSON>");
  process.exit(1);
}
const requireIn = createRequire(join(d3Dir, "package.json"));
const d3 = await import(requireIn.resolve("d3-geo"));
const { topology } = await import(requireIn.resolve("topojson-server"));
const { presimplify, simplify, sphericalTriangleArea } = await import(requireIn.resolve("topojson-simplify"));
const { feature: toFeatures } = await import(requireIn.resolve("topojson-client"));

const raw = readFileSync(join(dataDir, INPUT));
const actual = createHash("sha256").update(raw).digest("hex");
if (actual !== INPUT_SHA256) throw new Error(`${INPUT} : sha256 ${actual}, ${INPUT_SHA256} attendue (commit ${NE_COMMIT})`);
const source = JSON.parse(raw.toString("utf8"));
source.features = source.features.filter((feature) => !LEFT_OUT.has(feature.properties.ADM0_A3));
const presimplified = presimplify(topology({ countries: source }, 1e6), sphericalTriangleArea);

/** A polygon simplified on the sphere can come out inside out, covering the rest of the globe: turned back. */
function upright(feature) {
  if (!feature.geometry) return feature;
  const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.type === "MultiPolygon" ? feature.geometry.coordinates : [];
  const fixed = polygons
    .filter((rings) => rings[0] && rings[0].length >= 4)
    .map((rings) => (d3.geoArea({ type: "Polygon", coordinates: rings }) > 2 * Math.PI ? rings.map((ring) => [...ring].reverse()) : rings));
  return { ...feature, geometry: { type: "MultiPolygon", coordinates: fixed } };
}

/**
 * The countries for a map that shows `steradians` of the globe on `pixels` square pixels: shared borders stay
 * shared, every map its own detail (a small country keeps its shape).
 */
const simplifiedFor = (steradians, pixels) =>
  toFeatures(simplify(presimplified, (MIN_PIXELS * steradians) / pixels), presimplified.objects.countries).features.map(upright);
const world110 = simplifiedFor(4 * Math.PI, 2000 * 1040);

const REPO = join(import.meta.dirname, "..", "..");
const OUT = join(REPO, "vendor", "library", "natural-earth");
rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, "continents"), { recursive: true });
mkdirSync(join(OUT, "countries"), { recursive: true });

const code = (props) => props.ADM0_A3;
const iso2 = (props) => [props.ISO_A2_EH, props.ISO_A2].find((value) => value && value !== "-99" && /^[A-Z]{2}$/.test(value)) ?? null;
const escape = (text) => String(text).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const round = (n) => Math.round(n * 10) / 10;

/** One <path> per country, its id the ISO alpha-3 code, its names as data attributes. */
function svg(features, projection, { width, height, viewBox, fill = () => LAND }) {
  const path = d3.geoPath(projection).digits(1);
  const paths = features
    .map((feature) => {
      const d = path(feature);
      if (!d) return "";
      const p = feature.properties;
      return `<path id="${code(p)}" data-name="${escape(p.NAME_FR ?? p.NAME)}" data-iso2="${iso2(p) ?? ""}" fill="${fill(feature)}" d="${d}"/>`;
    })
    .filter(Boolean);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox ?? `0 0 ${width} ${height}`}"><g stroke="${BORDER}" stroke-width="0.8" stroke-linejoin="round">${paths.join("")}</g></svg>\n`;
}

/** A country without its far-off parts: the polygons within MAIN_PART_KM of its largest one. */
function mainPart(feature) {
  if (feature.geometry.type !== "MultiPolygon") return feature;
  const polygons = feature.geometry.coordinates.map((coordinates) => ({ type: "Polygon", coordinates }));
  const largest = polygons.reduce((best, polygon) => (d3.geoArea(polygon) > d3.geoArea(best) ? polygon : best));
  const center = d3.geoCentroid(largest);
  const kept = polygons.filter((polygon) => d3.geoDistance(center, d3.geoCentroid(polygon)) * 6371 <= MAIN_PART_KM);
  return { ...feature, geometry: { type: "MultiPolygon", coordinates: kept.map((polygon) => polygon.coordinates) } };
}

const box = ([west, south, east, north]) => {
  // Densified, so the box keeps its shape once projected.
  const ring = [];
  for (let x = west; x <= east; x += 1) ring.push([x, south]);
  for (let y = south; y <= north; y += 1) ring.push([east, y]);
  for (let x = east; x >= west; x -= 1) ring.push([x, north]);
  for (let y = north; y >= south; y -= 1) ring.push([west, y]);
  ring.push(ring[0]);
  return { type: "Polygon", coordinates: [ring.reverse()] };
};

const base = { format: "svg", pack: "natural-earth", license: "public-domain", source: "https://www.naturalearthdata.com/", author: "Natural Earth" };
const COLOR_TIP = "Pour colorer un pays, insère le SVG dans la page (pas en <img>) et cible son <path> par son code ISO à trois lettres (#FRA) ; data-name porte son nom français.";
const entries = [];

// The world, without Antarctica.
{
  const width = 2000;
  const height = 1040;
  const land = world110.filter((feature) => feature.properties.CONTINENT !== "Antarctica");
  const projection = d3.geoNaturalEarth1().fitExtent([[10, 10], [width - 10, height - 10]], { type: "FeatureCollection", features: land });
  writeFileSync(join(OUT, "world.svg"), svg(land, projection, { width, height }));
  entries.push({
    ...base,
    id: "carte-monde",
    kind: "map",
    title: "Carte du monde, tous les pays (sans l'Antarctique)",
    tags: { fr: ["carte", "monde", "planète", "pays", "international", "global", "mappemonde"], en: ["map", "world", "globe", "countries", "international", "global"] },
    useWhen: `Planisphère gris clair, projection Natural Earth, 2000×1040, un tracé par pays. Pour une présence internationale, des marchés, des pays à colorier. ${COLOR_TIP}`,
    avoidFor: "Un zoom sur une région : prends la carte du continent ou du pays.",
    file: "natural-earth/world.svg",
  });
}

// The continents, their neighbours in a lighter grey.
for (const [slug, continent] of Object.entries(CONTINENTS)) {
  const width = 1600;
  const height = 1200;
  const [west, south, east, north] = continent.box;
  const projection = d3
    .geoAzimuthalEqualArea()
    .rotate([-(west + east) / 2, -(south + north) / 2])
    .fitExtent([[20, 20], [width - 20, height - 20]], box(continent.box));
  projection.clipExtent([[0, 0], [width, height]]);
  const fill = (feature) => (feature.properties.CONTINENT === continent.name ? HIGHLIGHT : LAND);
  const countries = simplifiedFor(d3.geoArea(box(continent.box)), width * height);
  writeFileSync(join(OUT, "continents", `${slug}.svg`), svg(countries, projection, { width, height, fill }));
  entries.push({
    ...base,
    id: `carte-${slug}`,
    kind: "map",
    title: `Carte : ${continent.fr}, pays par pays`,
    tags: { fr: ["carte", "continent", continent.fr.toLowerCase(), "pays", "région"], en: ["map", "continent", continent.name.toLowerCase(), "countries", "region"] },
    useWhen: `Carte de ${continent.fr}, 1600×1200 : ses pays en gris foncé, leurs voisins en gris clair, un tracé par pays. ${COLOR_TIP}`,
    avoidFor: "Un seul pays à montrer en grand : prends sa carte.",
    file: `natural-earth/continents/${slug}.svg`,
  });
}

// One map per country, its main part only. A territory that shares its state's ISO2 code (Australia's dependencies)
// is named by its own ADM0 code, the state keeping the ISO2 one.
const owner = new Map();
const full = toFeatures(presimplified, presimplified.objects.countries).features;
for (const feature of full) {
  const two = iso2(feature.properties);
  if (two && (!owner.has(two) || feature.properties.ISO_A3_EH === code(feature.properties))) owner.set(two, code(feature.properties));
}
for (const [index, fullFeature] of full.entries()) {
  // Its own detail: the main part at full resolution sets the area the map shows.
  const area = d3.geoArea(mainPart(upright(fullFeature)));
  const feature = simplifiedFor(Math.max(area, 1e-9), 1000 * 1000)[index];
  const p = feature.properties;
  const main = mainPart(feature);
  const [lon, lat] = d3.geoCentroid(main);
  const projection = d3.geoAzimuthalEqualArea().rotate([-lon, -lat]).fitExtent([[0, 0], [1000, 1000]], main);
  const [[x0, y0], [x1, y1]] = d3.geoPath(projection).bounds(main);
  const pad = 10;
  const width = Math.ceil(x1 - x0 + 2 * pad);
  const height = Math.ceil(y1 - y0 + 2 * pad);
  const two = iso2(p);
  const slug = (two && owner.get(two) === code(p) ? two : code(p)).toLowerCase();
  const file = `countries/${slug}.svg`;
  writeFileSync(join(OUT, file), svg([main], projection, { width, height, viewBox: `${round(x0 - pad)} ${round(y0 - pad)} ${width} ${height}` }));
  const name = p.NAME_FR ?? p.NAME;
  const dropped = feature.geometry.type === "MultiPolygon" && main.geometry.coordinates.length < feature.geometry.coordinates.length;
  entries.push({
    ...base,
    id: `carte-pays-${slug}`,
    kind: "map",
    title: `Carte : ${name}`,
    tags: {
      fr: [...new Set(["carte", "pays", "silhouette", name, slug, code(p).toLowerCase(), CONTINENT_FR[p.CONTINENT] ?? ""].filter(Boolean))].sort(),
      en: [...new Set(["map", "country", "outline", p.NAME, p.NAME_LONG ?? "", slug, code(p).toLowerCase(), p.CONTINENT].filter(Boolean))].sort(),
    },
    useWhen: `Silhouette de ${name} (${code(p)}), gris clair, à sa taille propre, frontières de la vue officielle française.${VIEW_NOTES[code(p)] ? ` ${VIEW_NOTES[code(p)]}` : ""}${dropped ? " Ses territoires lointains (outre-mer, îles éloignées) n'y sont pas : ils sont sur la carte du monde." : ""} ${COLOR_TIP}`,
    avoidFor: ["Disputed", "Indeterminate"].includes(p.TYPE) || code(p) === "TWN"
      ? "Statut ou frontières contestés : vérifie que la campagne accepte de le montrer ainsi."
      : "Situer le pays parmi ses voisins : prends la carte du continent.",
    file: `natural-earth/${file}`,
  });
}

const ids = new Set();
for (const entry of entries) {
  if (ids.has(entry.id)) throw new Error(`id en double : ${entry.id}`);
  ids.add(entry.id);
}
writeFileSync(
  join(OUT, "SOURCE.md"),
  `# Natural Earth\n\nCartes générées par \`scripts/library/natural-earth.mjs\` depuis Natural Earth (domaine public,\nhttps://www.naturalearthdata.com/), fichier ${INPUT} du dépôt nvkelso/natural-earth-vector au commit\n${NE_COMMIT}, avec d3-geo 3.1.1 et topojson 3.\n\nFrontières : vue officielle française de Natural Earth. La Crimée est ukrainienne ; Somaliland, Chypre du Nord et le\nSahara occidental sont fondus dans la Somalie, Chypre et le Maroc ; la partie du Golan tenue par Israël n'appartient à\naucun État. Tracés du 1:10m simplifiés pour chaque carte selon\nla surface qu'elle montre (un point part quand il pèse moins de ${MIN_PIXELS} px²). Monde sans l'Antarctique ; une carte de pays ne garde que les parties à moins de\n${MAIN_PART_KM} km de la plus grande.\n`,
);
const catalogPath = join(REPO, "workspace", "library", "catalog.json");
const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
catalog.entries = [...catalog.entries.filter((entry) => entry.pack !== "natural-earth"), ...entries];
writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`${entries.length} cartes : monde, ${Object.keys(CONTINENTS).length} continents, ${entries.length - 1 - Object.keys(CONTINENTS).length} pays.`);
