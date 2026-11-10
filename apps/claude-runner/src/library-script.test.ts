import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

const SCRIPT = join(__dirname, "../../../workspace/scripts/library.mjs");

const base = { useWhen: "Quand il le faut.", avoidFor: "", license: "CC0-1.0", source: "https://example.com/", author: "Auteur" };
const ENTRIES = [
  { ...base, id: "peep-assis-bureau", kind: "character", title: "Personne assise à son bureau", tags: { fr: ["assis", "bureau", "travail"], en: ["sitting", "desk", "work"] }, file: "peeps/assis.svg", format: "svg", pack: "peeps" },
  { ...base, id: "peep-debout", kind: "character", title: "Personne debout", tags: { fr: ["debout", "personne"], en: ["standing", "person"] }, file: "peeps/debout.svg", format: "svg", pack: "peeps" },
  { ...base, id: "icone-telephone", kind: "icon", title: "Téléphone", tags: { fr: ["téléphone", "appel"], en: ["phone", "call"] }, file: "icons/phone.svg", format: "svg", pack: "icons", license: "ISC" },
  { ...base, id: "emoji-fusee", kind: "object", title: "Fusée", tags: { fr: ["fusée", "lancement"], en: ["rocket", "launch"] }, file: "emoji/rocket.png", format: "png", pack: "emoji", dimensions: { width: 256, height: 256 } },
  { ...base, id: "scene-appareils", kind: "component", title: "Appareils en éventail", tags: { fr: ["appareils"], en: ["devices"] }, file: "registry/components/splay/splay.html", format: "html", pack: "registry", license: "Apache-2.0" },
  { ...base, id: "drapeau-fr", kind: "flag", title: "Drapeau de la France", tags: { fr: ["france", "français"], en: ["france", "french", "fr"] }, file: "flags/fr.svg", format: "svg", pack: "flags" },
];

let workspace: string;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), "library-ws-"));
  const library = join(workspace, "library");
  for (const dir of ["peeps", "icons", "emoji", "flags", "registry/components/splay"]) mkdirSync(join(library, dir), { recursive: true });
  writeFileSync(join(library, "registry/components/splay/splay.html"), "<template></template>");
  writeFileSync(join(library, "registry/components/splay/registry-item.json"), "{}");
  writeFileSync(join(library, "catalog.json"), JSON.stringify({ version: 1, entries: ENTRIES }));
  writeFileSync(join(library, "peeps/assis.svg"), '<svg><path fill="#000"/><path fill="#fff"/></svg>');
  writeFileSync(join(library, "peeps/debout.svg"), "<svg><path/></svg>");
  writeFileSync(join(library, "icons/phone.svg"), '<svg stroke="currentColor" fill="none"><path/></svg>');
  writeFileSync(join(library, "emoji/rocket.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  writeFileSync(join(library, "flags/fr.svg"), '<svg><rect fill="#002395"/><rect fill="#ed2939"/></svg>');
  mkdirSync(join(workspace, "videos", "demo"), { recursive: true });
});

function library(...args: string[]) {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: workspace, encoding: "utf8", env: { ...process.env, STUDIO_LIBRARY_DIR: join(workspace, "library") } });
  return { out: result.stdout, err: result.stderr, status: result.status };
}
const ids = (...args: string[]) => (JSON.parse(library("search", ...args, "--json").out) as { id: string }[]).map((entry) => entry.id);
const credits = () => JSON.parse(readFileSync(join(workspace, "videos/demo/assets/library/CREDITS.json"), "utf8")) as { assets: { file: string; id: string; license: string }[] };

describe("library.mjs search", () => {
  it("finds in French and in English, accents and plurals aside", () => {
    expect(ids("telephones")).toEqual(["icone-telephone"]);
    expect(ids("phone")).toEqual(["icone-telephone"]);
    expect(ids("Fusée")).toEqual(["emoji-fusee"]);
    expect(ids("cœur")).toEqual(ids("coeur"));
  });

  it("puts the asset that matches the most words first, the same way every time", () => {
    expect(ids("personne assise au bureau")).toEqual(["peep-assis-bureau", "peep-debout"]);
    expect(ids("personne assise au bureau")).toEqual(ids("personne assise au bureau"));
  });

  it("matches the start of a word, filters by kind and keeps to the limit", () => {
    expect(ids("lanc")).toEqual(["emoji-fusee"]);
    expect(ids("calling")).toEqual(["icone-telephone"]);
    expect(ids("personne", "--kind", "icon")).toEqual([]);
    expect(ids("", "--kind", "character")).toEqual(["peep-assis-bureau", "peep-debout"]);
    expect(ids("personne bureau", "--limit", "1")).toEqual(["peep-assis-bureau"]);
  });

  it("describes each result with what the agent needs to choose it", () => {
    const { out, status } = library("search", "fusée");
    expect(status).toBe(0);
    expect(out).toContain("emoji-fusee  [object]  Fusée");
    expect(out).toContain("256×256 px");
    expect(out).toContain("library.mjs add <id>");
  });

  it("says so when nothing matches", () => {
    const { out, status } = library("search", "dinosaure");
    expect(status).toBe(0);
    expect(out).toContain("AUCUN RÉSULTAT pour « dinosaure »");
    expect(out).toContain("note le manque");
  });

  it("refuses an unknown kind", () => {
    expect(library("search", "x", "--kind", "voiture").status).toBe(1);
  });
});

describe("library.mjs add", () => {
  it("copies the file into the video and credits it", () => {
    const { out, status } = library("add", "emoji-fusee", "videos/demo");
    expect(status).toBe(0);
    expect(out).toContain("assets/library/emoji/rocket.png");
    expect(existsSync(join(workspace, "videos/demo/assets/library/emoji/rocket.png"))).toBe(true);
    expect(credits().assets).toEqual([expect.objectContaining({ file: "assets/library/emoji/rocket.png", id: "emoji-fusee", license: "CC0-1.0" })]);
  });

  it("copies a file under a name a src takes as it is", () => {
    mkdirSync(join(workspace, "library/emoji/Thumbs up/3D"), { recursive: true });
    writeFileSync(join(workspace, "library/emoji/Thumbs up/3D/piñata_(3d).png"), "png");
    const catalog = JSON.parse(readFileSync(join(workspace, "library/catalog.json"), "utf8"));
    catalog.entries.push({ ...ENTRIES[3], id: "emoji-pouce", file: "emoji/Thumbs up/3D/piñata_(3d).png" });
    writeFileSync(join(workspace, "library/catalog.json"), JSON.stringify(catalog));
    expect(library("add", "emoji-pouce", "videos/demo").out).toContain("assets/library/emoji/Thumbs-up/3D/pinata_-3d-.png");
    expect(existsSync(join(workspace, "videos/demo/assets/library/emoji/Thumbs-up/3D/pinata_-3d-.png"))).toBe(true);
  });

  it("duplicates neither the file nor the credit when run again", () => {
    library("add", "drapeau-fr", "videos/demo");
    library("add", "emoji-fusee", "videos/demo");
    library("add", "drapeau-fr", "videos/demo");
    expect(credits().assets.map((asset) => asset.id)).toEqual(["emoji-fusee", "drapeau-fr"]);
    expect(readdirSync(join(workspace, "videos/demo/assets/library/flags"))).toEqual(["fr.svg"]);
  });

  it("tints a single-colour SVG under its own name", () => {
    expect(library("add", "icone-telephone", "videos/demo", "--color", "#FF6600").status).toBe(0);
    const tinted = readFileSync(join(workspace, "videos/demo/assets/library/icons/phone-ff6600.svg"), "utf8");
    expect(tinted).toBe('<svg stroke="#ff6600" fill="none"><path/></svg>');
    library("add", "peep-debout", "videos/demo", "--color", "#123456");
    expect(readFileSync(join(workspace, "videos/demo/assets/library/peeps/debout-123456.svg"), "utf8")).toBe('<svg fill="#123456"><path/></svg>');
    expect(credits().assets.map((asset) => asset.file)).toEqual(["assets/library/icons/phone-ff6600.svg", "assets/library/peeps/debout-123456.svg"]);
  });

  it("puts a component of the registry where `hyperframes add` would, with its mount snippet and credit", () => {
    const { out, status } = library("add", "scene-appareils", "videos/demo");
    expect(status).toBe(0);
    expect(readFileSync(join(workspace, "videos/demo/compositions/components/splay.html"), "utf8")).toBe("<template></template>");
    expect(out).toContain('data-composition-src="compositions/components/splay.html"');
    expect(out).toContain("library/registry/components/splay/registry-item.json");
    expect(credits().assets).toEqual([expect.objectContaining({ file: "compositions/components/splay.html", license: "Apache-2.0" })]);
  });

  it("refuses to tint several colours or a bitmap", () => {
    expect(library("add", "drapeau-fr", "videos/demo", "--color", "#ff0000").err).toContain("une seule couleur");
    expect(library("add", "emoji-fusee", "videos/demo", "--color", "#ff0000").err).toContain("SVG");
    expect(existsSync(join(workspace, "videos/demo/assets/library/CREDITS.json"))).toBe(false);
  });

  it("refuses an unknown id and a folder outside the videos", () => {
    expect(library("add", "inconnu", "videos/demo").err).toContain("Asset inconnu");
    expect(library("add", "emoji-fusee", "library").status).toBe(1);
    expect(library("add", "emoji-fusee", "videos/absente").status).toBe(1);
  });
});

describe("library.mjs on the shipped catalog", () => {
  it("runs against the repository's library", () => {
    const out = execFileSync(process.execPath, [SCRIPT, "search", "téléphone"], { encoding: "utf8" });
    expect(out).toMatch(/AUCUN RÉSULTAT|résultat\(s\)/);
  });
});
