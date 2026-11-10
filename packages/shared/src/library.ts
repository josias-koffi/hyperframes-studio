import { z } from "zod";

/**
 * The asset library: free packs the agents pick from instead of drawing the object by hand. `catalog.json` describes
 * each asset for them; `library.lock.json` pins where each pack comes from, since the files are not in the repository.
 */

export const LIBRARY_LICENSES = ["CC0-1.0", "public-domain", "MIT", "ISC", "Apache-2.0"] as const;
export type LibraryLicense = (typeof LIBRARY_LICENSES)[number];

/** Licenses whose text must ship with the app. */
const LICENSES_WITH_NOTICE: readonly LibraryLicense[] = ["MIT", "ISC", "Apache-2.0"];

export const LIBRARY_KINDS = ["character", "object", "icon", "flag", "illustration", "avatar", "map", "sound", "device", "component", "transition"] as const;
export type LibraryKind = (typeof LIBRARY_KINDS)[number];

export const LIBRARY_FORMATS = ["svg", "png", "webp", "wav", "html", "glsl"] as const;
export type LibraryFormat = (typeof LIBRARY_FORMATS)[number];

const BITMAP_FORMATS: readonly LibraryFormat[] = ["png", "webp"];

/** Relative, forward slashes, and staying inside its folder on every platform. */
export function isSafeLibraryPath(path: string): boolean {
  if (path.includes("\\") || path.includes(":")) return false;
  return path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

const safePathSchema = z.string().refine(isSafeLibraryPath, "chemin hors de la bibliothèque");
const packIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,40}$/);
const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const tagsSchema = z.array(z.string().min(1)).min(1);

export const libraryEntrySchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,80}$/),
  kind: z.enum(LIBRARY_KINDS),
  /** What the asset shows, in French. */
  title: z.string().min(1),
  /** Searched in the language of the brief as well as in the English of the agents. */
  tags: z.object({ fr: tagsSchema, en: tagsSchema }),
  /** When an agent should pick it, in French. */
  useWhen: z.string().min(1),
  /** When it should not, in French; empty when nothing comes to mind. */
  avoidFor: z.string(),
  /** Relative to the library's root, starting with the pack's folder. */
  file: safePathSchema,
  format: z.enum(LIBRARY_FORMATS),
  /** In pixels; required for a bitmap, whose size limits how large it can be shown. */
  dimensions: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }).optional(),
  pack: packIdSchema,
  license: z.enum(LIBRARY_LICENSES),
  /** The page the asset comes from. */
  source: z.url(),
  author: z.string().min(1),
});
export type LibraryEntry = z.infer<typeof libraryEntrySchema>;

export const libraryCatalogSchema = z
  .object({
    /** Raised when the content changes: the app copies the library again when it differs. */
    version: z.number().int().positive(),
    entries: z.array(libraryEntrySchema),
  })
  .superRefine((catalog, ctx) => {
    const seen = new Set<string>();
    catalog.entries.forEach((entry, index) => {
      const problem = (message: string) => ctx.addIssue({ code: "custom", message: `${entry.id} : ${message}`, path: ["entries", index] });
      if (seen.has(entry.id)) problem("id déjà utilisé");
      seen.add(entry.id);
      if (!entry.file.startsWith(`${entry.pack}/`)) problem(`le fichier doit être dans le dossier du pack ${entry.pack}`);
      if (!entry.file.endsWith(`.${entry.format}`)) problem(`l'extension du fichier doit être .${entry.format}`);
      if (BITMAP_FORMATS.includes(entry.format) && !entry.dimensions) problem("une image bitmap doit donner ses dimensions");
    });
  });
export type LibraryCatalog = z.infer<typeof libraryCatalogSchema>;

const sourceBase = {
  pack: packIdSchema,
  license: z.enum(LIBRARY_LICENSES),
  /** The license text inside the pack's folder, shipped with the app. */
  licenseFile: safePathSchema.optional(),
};

const githubSourceSchema = z.object({
  ...sourceBase,
  type: z.literal("github"),
  repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
  commit: z.string().regex(/^[0-9a-f]{40}$/),
  /** Paths of the repository to keep; `*` stays within a folder, `**` crosses them. */
  include: z.array(z.string().min(1)).min(1),
  /** Digest of the kept files (`digestOfFiles`): a download error prints the value to write here. */
  sha256: sha256Schema,
});

const filesSourceSchema = z.object({
  ...sourceBase,
  type: z.literal("files"),
  files: z.array(z.object({ url: z.url(), path: safePathSchema, sha256: sha256Schema })).min(1),
});

export const libraryLockSchema = z
  .object({
    version: z.number().int().positive(),
    sources: z.array(z.discriminatedUnion("type", [githubSourceSchema, filesSourceSchema])),
  })
  .superRefine((lock, ctx) => {
    const seen = new Set<string>();
    lock.sources.forEach((source, index) => {
      const problem = (message: string) => ctx.addIssue({ code: "custom", message: `${source.pack} : ${message}`, path: ["sources", index] });
      if (seen.has(source.pack)) problem("pack déjà déclaré");
      seen.add(source.pack);
      if (LICENSES_WITH_NOTICE.includes(source.license) && !source.licenseFile) problem(`la licence ${source.license} demande son texte (licenseFile)`);
      if (source.type === "files" && new Set(source.files.map((file) => file.path)).size !== source.files.length) problem("deux fichiers au même chemin");
    });
  });
export type LibraryLock = z.infer<typeof libraryLockSchema>;
export type LibrarySource = LibraryLock["sources"][number];

/**
 * What a schema cannot see, in French: the entries against the sources they claim and the files on disk. `exists`
 * takes a path relative to the library's root.
 */
export function libraryProblems(catalog: LibraryCatalog, lock: LibraryLock, exists: (path: string) => boolean): string[] {
  const problems: string[] = [];
  const sources = new Map(lock.sources.map((source) => [source.pack, source]));
  for (const entry of catalog.entries) {
    const source = sources.get(entry.pack);
    if (!source) problems.push(`${entry.id} : le pack ${entry.pack} n'est pas dans le lock`);
    else if (source.license !== entry.license) problems.push(`${entry.id} : licence ${entry.license}, alors que le pack est sous ${source.license}`);
    if (!exists(entry.file)) problems.push(`${entry.id} : fichier absent, ${entry.file}`);
  }
  for (const source of lock.sources) {
    if (source.licenseFile && !exists(`${source.pack}/${source.licenseFile}`)) problems.push(`${source.pack} : texte de licence absent, ${source.pack}/${source.licenseFile}`);
  }
  return problems;
}

/** Written by `scripts/fetch-library.mjs` next to the catalog: what the « À propos » screen shows. */
export const LIBRARY_NOTICES_FILE = "notices.json";

export const libraryNoticeSchema = z.object({
  pack: packIdSchema,
  license: z.enum(LIBRARY_LICENSES),
  /** Assets of the pack in the catalog. */
  assets: z.number().int().nonnegative(),
  authors: z.array(z.string()),
  /** The pages the pack comes from. */
  sources: z.array(z.string()),
  /** The license's text as shipped in the pack; null when the license asks for none (CC0, public domain). */
  text: z.string().nullable(),
});
export type LibraryNotice = z.infer<typeof libraryNoticeSchema>;

export const libraryNoticesSchema = z.object({ version: z.literal(1), packs: z.array(libraryNoticeSchema) });
export type LibraryNotices = z.infer<typeof libraryNoticesSchema>;

const sorted = (values: Iterable<string>) => [...new Set(values)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

/**
 * The legal notices of the library, from the catalog and the lock alone: one per pack, with its authors, its sources
 * and its license text. `readText` takes a path relative to the library's root.
 */
export function libraryNotices(catalog: LibraryCatalog, lock: LibraryLock, readText: (path: string) => string): LibraryNotices {
  const packs = [...lock.sources]
    .sort((a, b) => (a.pack < b.pack ? -1 : a.pack > b.pack ? 1 : 0))
    .map((source) => {
      const entries = catalog.entries.filter((entry) => entry.pack === source.pack);
      const origin = source.type === "github" ? [`https://github.com/${source.repo}`] : [];
      return {
        pack: source.pack,
        license: source.license,
        assets: entries.length,
        authors: sorted(entries.map((entry) => entry.author)),
        sources: sorted([...origin, ...entries.map((entry) => entry.source)]),
        text: source.licenseFile ? readText(`${source.pack}/${source.licenseFile}`) : null,
      };
    });
  return { version: 1, packs };
}
