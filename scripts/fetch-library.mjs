#!/usr/bin/env node
// Remplit workspace/library/ à partir de library.lock.json, puis vérifie le catalogue. Lance `pnpm build` avant.
//
// Usage, depuis la racine du dépôt :
//   node scripts/fetch-library.mjs [--lock <fichier>] [--dest <dossier>]
//
// Pour ajouter une source GitHub : écris une sha256 quelconque de 64 caractères, lance le script, et reporte la valeur
// « obtenue » de l'erreur après avoir relu les fichiers.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 && index + 1 < argv.length ? resolve(argv[index + 1]) : fallback;
};
const lockPath = flag("lock", join(REPO, "library.lock.json"));
const dest = flag("dest", join(REPO, "workspace", "library"));

const shared = (await import(pathToFileURL(join(REPO, "packages/shared/dist/index.js")).href)).default;
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

try {
  const lock = shared.libraryLockSchema.parse(readJson(lockPath));
  const { fetched, kept } = await shared.fetchLibrary({ lock, dest });
  console.log(`Bibliothèque : ${fetched.length} pack(s) téléchargé(s), ${kept.length} déjà à jour.`);

  const catalog = shared.libraryCatalogSchema.parse(readJson(join(dest, "catalog.json")));
  const problems = shared.libraryProblems(catalog, lock, (path) => existsSync(join(dest, path)));
  if (problems.length > 0) {
    console.error(`Bibliothèque incohérente :\n${problems.map((problem) => `- ${problem}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`Catalogue valide : ${catalog.entries.length} asset(s).`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
