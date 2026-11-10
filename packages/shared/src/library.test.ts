import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { libraryCatalogSchema, libraryLockSchema, libraryNotices, libraryNoticesSchema, libraryProblems, type LibraryCatalog, type LibraryLock } from "./library";

const SHA = "a".repeat(64);
const COMMIT = "b".repeat(40);

const entry = {
  id: "peep-assis",
  kind: "character",
  title: "Personne assise",
  tags: { fr: ["assis", "personne"], en: ["sitting", "person"] },
  useWhen: "Pour montrer quelqu'un au travail.",
  avoidFor: "Une scène de groupe.",
  file: "open-peeps/peep-1.svg",
  format: "svg",
  pack: "open-peeps",
  license: "CC0-1.0",
  source: "https://www.openpeeps.com/",
  author: "Pablo Stanley",
};

const catalog = (overrides: Record<string, unknown> = {}) => ({ version: 1, entries: [{ ...entry, ...overrides }] });

const filesSource = { pack: "open-peeps", type: "files", license: "CC0-1.0", files: [{ url: "https://example.com/a.svg", path: "peep-1.svg", sha256: SHA }] };
const githubSource = { pack: "flags", type: "github", repo: "lipis/flag-icons", commit: COMMIT, license: "MIT", licenseFile: "LICENSE", include: ["flags/4x3/*.svg", "LICENSE"], sha256: SHA };

describe("libraryCatalogSchema", () => {
  it("accepts a complete entry", () => {
    expect(libraryCatalogSchema.parse(catalog()).entries[0]?.id).toBe("peep-assis");
  });

  it("refuses a license outside the allowed list", () => {
    expect(libraryCatalogSchema.safeParse(catalog({ license: "CC-BY-4.0" })).success).toBe(false);
  });

  it("refuses a path that leaves the library", () => {
    for (const file of ["/etc/passwd", "open-peeps/../../secret.svg", "open-peeps\\peep.svg", "C:/peep.svg"]) {
      expect(libraryCatalogSchema.safeParse(catalog({ file })).success, file).toBe(false);
    }
  });

  it("refuses a file outside its pack or of another format", () => {
    expect(libraryCatalogSchema.safeParse(catalog({ file: "flags/fr.svg" })).success).toBe(false);
    expect(libraryCatalogSchema.safeParse(catalog({ format: "png", dimensions: { width: 1, height: 1 } })).success).toBe(false);
  });

  it("asks for the tags in both languages", () => {
    expect(libraryCatalogSchema.safeParse(catalog({ tags: { fr: ["assis"], en: [] } })).success).toBe(false);
  });

  it("asks for the dimensions of a bitmap", () => {
    const png = { file: "open-peeps/peep-1.png", format: "png" };
    expect(libraryCatalogSchema.safeParse(catalog(png)).success).toBe(false);
    expect(libraryCatalogSchema.safeParse(catalog({ ...png, dimensions: { width: 720, height: 972 } })).success).toBe(true);
  });

  it("asks a sound for its placement", () => {
    const sound = { kind: "sound", file: "open-peeps/tick.wav", format: "wav" };
    expect(libraryCatalogSchema.safeParse(catalog(sound)).success).toBe(false);
    const placed = { ...sound, sound: { duration: 0.3, syncAt: 0.01, meets: "instant", underVoiceoverDb: -6 } };
    expect(libraryCatalogSchema.safeParse(catalog(placed)).success).toBe(true);
  });

  it("refuses two entries with the same id", () => {
    expect(libraryCatalogSchema.safeParse({ version: 1, entries: [entry, entry] }).success).toBe(false);
  });
});

describe("libraryLockSchema", () => {
  it("accepts a GitHub source and a list of files", () => {
    expect(libraryLockSchema.parse({ version: 1, sources: [filesSource, githubSource] }).sources).toHaveLength(2);
  });

  it("refuses a branch instead of a commit, and a malformed digest", () => {
    expect(libraryLockSchema.safeParse({ version: 1, sources: [{ ...githubSource, commit: "main" }] }).success).toBe(false);
    expect(libraryLockSchema.safeParse({ version: 1, sources: [{ ...githubSource, sha256: "abc" }] }).success).toBe(false);
  });

  it("refuses a source under a license outside the allowed list", () => {
    expect(libraryLockSchema.safeParse({ version: 1, sources: [{ ...filesSource, license: "CC-BY-SA-4.0" }] }).success).toBe(false);
  });

  it("asks for the license text when the license requires it", () => {
    expect(libraryLockSchema.safeParse({ version: 1, sources: [{ ...githubSource, licenseFile: undefined }] }).success).toBe(false);
  });

  it("refuses two sources with the same pack and a file leaving its pack", () => {
    expect(libraryLockSchema.safeParse({ version: 1, sources: [filesSource, filesSource] }).success).toBe(false);
    const escaping = { ...filesSource, files: [{ ...filesSource.files[0], path: "../peep.svg" }] };
    expect(libraryLockSchema.safeParse({ version: 1, sources: [escaping] }).success).toBe(false);
  });
});

describe("libraryProblems", () => {
  const lock: LibraryLock = libraryLockSchema.parse({ version: 1, sources: [filesSource, githubSource] });
  const parsed: LibraryCatalog = libraryCatalogSchema.parse(catalog());
  const present = new Set(["open-peeps/peep-1.svg", "flags/LICENSE"]);
  const exists = (path: string) => present.has(path);

  it("finds nothing in a coherent library", () => {
    expect(libraryProblems(parsed, lock, exists)).toEqual([]);
  });

  it("reports a missing file", () => {
    expect(libraryProblems(parsed, lock, () => false).join("\n")).toContain("open-peeps/peep-1.svg");
  });

  it("reports a pack absent from the lock", () => {
    const orphan = libraryCatalogSchema.parse(catalog({ pack: "autre", file: "autre/peep-1.svg" }));
    expect(libraryProblems(orphan, lock, () => true).join("\n")).toContain("autre");
  });

  it("reports a license that differs from its source", () => {
    expect(libraryProblems(libraryCatalogSchema.parse(catalog({ license: "MIT" })), lock, exists).join("\n")).toContain("CC0-1.0");
  });

  it("reports a missing license text", () => {
    expect(libraryProblems(parsed, lock, (path) => path !== "flags/LICENSE").join("\n")).toContain("flags/LICENSE");
  });
});

describe("libraryNotices", () => {
  const lock = libraryLockSchema.parse({ version: 1, sources: [githubSource, filesSource] });
  const parsed = libraryCatalogSchema.parse({
    version: 1,
    entries: [entry, { ...entry, id: "peep-debout", file: "open-peeps/peep-2.svg", author: "Autre" }, { ...entry, id: "peep-groupe", file: "open-peeps/peep-3.svg" }],
  });

  it("gives every pack its license text, authors and sources, from the catalog and the lock", () => {
    const read: string[] = [];
    const notices = libraryNotices(parsed, lock, (path) => {
      read.push(path);
      return "MIT License";
    });
    expect(libraryNoticesSchema.parse(notices)).toEqual({
      version: 1,
      packs: [
        { pack: "flags", license: "MIT", assets: 0, authors: [], sources: ["https://github.com/lipis/flag-icons"], text: "MIT License" },
        { pack: "open-peeps", license: "CC0-1.0", assets: 3, authors: ["Autre", "Pablo Stanley"], sources: ["https://www.openpeeps.com/"], text: null },
      ],
    });
    expect(read).toEqual(["flags/LICENSE"]);
  });
});

describe("the library of the repository", () => {
  const repo = join(__dirname, "../../..");

  it("has a valid and coherent catalog and lock", () => {
    const shipped = libraryCatalogSchema.parse(JSON.parse(readFileSync(join(repo, "workspace/library/catalog.json"), "utf8")));
    const pinned = libraryLockSchema.parse(JSON.parse(readFileSync(join(repo, "library.lock.json"), "utf8")));
    expect(libraryProblems(shipped, pinned, () => true)).toEqual([]);
  });

  it("ships no brand logo among the icons, and finds a flag by its French name and its ISO code", () => {
    const shipped = libraryCatalogSchema.parse(JSON.parse(readFileSync(join(repo, "workspace/library/catalog.json"), "utf8")));
    const icons = shipped.entries.filter((entry) => entry.kind === "icon");
    expect(icons.filter((entry) => /logo/.test(entry.id))).toEqual([]);
    const pinned = libraryLockSchema.parse(JSON.parse(readFileSync(join(repo, "library.lock.json"), "utf8")));
    const phosphor = pinned.sources.find((source) => source.pack === "phosphor");
    expect(phosphor?.type === "github" && phosphor.include).toEqual(expect.arrayContaining(["!assets/regular/*-logo.svg", "!assets/regular/*-logo-*.svg"]));
    const germany = shipped.entries.find((entry) => entry.id === "drapeau-de");
    expect(germany?.tags.fr).toEqual(expect.arrayContaining(["Allemagne", "de"]));
    expect(germany?.file).toBe("flag-icons/flags/4x3/de.svg");
  });

  it("generates avatars from CC0 styles only, never a CC BY style nor an artist's own license", () => {
    const manifest = JSON.parse(readFileSync(join(repo, "vendor/library/dicebear/avatars.json"), "utf8")) as { styles: Record<string, { license: string }> };
    expect(Object.keys(manifest.styles).length).toBeGreaterThan(0);
    for (const [style, { license }] of Object.entries(manifest.styles)) expect(license, style).toBe("CC0 1.0");
    const shipped = libraryCatalogSchema.parse(JSON.parse(readFileSync(join(repo, "workspace/library/catalog.json"), "utf8")));
    const avatars = shipped.entries.filter((entry) => entry.pack === "dicebear");
    expect(avatars.every((entry) => entry.license === "CC0-1.0" && entry.kind === "avatar" && Object.keys(manifest.styles).includes(entry.file.split("/")[1]))).toBe(true);
  });

  it("keeps only the default tone of the emojis with skin tones", () => {
    const shipped = libraryCatalogSchema.parse(JSON.parse(readFileSync(join(repo, "workspace/library/catalog.json"), "utf8")));
    const emojis = shipped.entries.filter((entry) => entry.pack === "fluent-emoji");
    expect(emojis.filter((entry) => /\/(Light|Medium-Light|Medium|Medium-Dark|Dark)\//.test(entry.file))).toEqual([]);
    expect(emojis.some((entry) => entry.file.includes("/Default/"))).toBe(true);
    expect(emojis.filter((entry) => entry.format === "png").every((entry) => (entry.dimensions?.width ?? 0) <= 320 && entry.useWhen.includes("320 px"))).toBe(true);
  });
});
