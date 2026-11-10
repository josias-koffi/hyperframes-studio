import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import type { LibraryLock, LibrarySource } from "./library";

const exec = promisify(execFile);

const DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000;
const PARALLEL_DOWNLOADS = 6;

type FileDigest = { path: string; sha256: string };

function sha256(content: Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

/** A folder's identity: its files' relative paths and contents, whatever the order they are listed in. */
export function digestOfFiles(files: readonly FileDigest[]): string {
  const lines = files.map((file) => `${file.path}\0${file.sha256}\n`).sort();
  return createHash("sha256").update(lines.join("")).digest("hex");
}

/** Regular files only: a symlink from a downloaded archive could point anywhere on the machine. */
async function regularFiles(root: string, relative = ""): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(join(root, relative), { withFileTypes: true })) {
    const path = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) found.push(...(await regularFiles(root, path)));
    else if (entry.isFile()) found.push(path);
  }
  return found;
}

/** `digestOfFiles` of a folder on disk, or null when it does not exist. */
export async function treeDigest(dir: string): Promise<string | null> {
  let paths: string[];
  try {
    paths = await regularFiles(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  return digestOfFiles(await Promise.all(paths.map(async (path) => ({ path, sha256: sha256(await readFile(join(dir, path))) }))));
}

function expectedDigest(source: LibrarySource): string {
  return source.type === "github" ? source.sha256 : digestOfFiles(source.files);
}

async function download(url: string): Promise<Uint8Array> {
  const response = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`${url} : HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

/** `*` stays within a folder, `**` crosses them. */
function globToRegExp(glob: string): RegExp {
  const pattern = glob
    .split(/(\*\*\/|\*\*|\*)/)
    .map((part) => {
      if (part === "**/") return "(?:.*/)?";
      if (part === "**") return ".*";
      if (part === "*") return "[^/]*";
      return part.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("");
  return new RegExp(`^${pattern}$`);
}

async function fetchGithubSource(source: Extract<LibrarySource, { type: "github" }>, staging: string, githubBase: string): Promise<void> {
  const unpacked = join(staging, `.src-${source.pack}`);
  await mkdir(unpacked, { recursive: true });
  const archive = join(staging, `.src-${source.pack}.tar.gz`);
  await writeFile(archive, await download(`${githubBase}/${source.repo}/tar.gz/${source.commit}`));
  await exec("tar", ["-xzf", archive, "-C", unpacked, "--strip-components=1"]);
  const patterns = source.include.map(globToRegExp);
  const kept = (await regularFiles(unpacked)).filter((path) => patterns.some((pattern) => pattern.test(path)));
  if (kept.length === 0) throw new Error(`${source.pack} : aucun fichier ne correspond à include`);
  for (const path of kept) {
    const target = join(staging, source.pack, path);
    await mkdir(dirname(target), { recursive: true });
    await rename(join(unpacked, path), target);
  }
  await rm(unpacked, { recursive: true, force: true });
  await rm(archive, { force: true });
}

async function fetchFilesSource(source: Extract<LibrarySource, { type: "files" }>, staging: string): Promise<void> {
  const queue = [...source.files];
  await Promise.all(
    Array.from({ length: PARALLEL_DOWNLOADS }, async () => {
      for (let file = queue.shift(); file; file = queue.shift()) {
        const content = await download(file.url);
        const actual = sha256(content);
        if (actual !== file.sha256) throw new Error(`${source.pack}/${file.path} : sha256 attendue ${file.sha256}, obtenue ${actual}`);
        const target = join(staging, source.pack, file.path);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, content);
      }
    }),
  );
}

/**
 * Brings `dest` in line with the lock. Every pack is downloaded and verified aside before any is installed: a failed
 * run leaves the library as it was. A pack already intact is not downloaded again.
 */
export async function fetchLibrary({
  lock,
  dest,
  githubBase = "https://codeload.github.com",
}: {
  lock: LibraryLock;
  dest: string;
  githubBase?: string;
}): Promise<{ fetched: string[]; kept: string[] }> {
  await mkdir(dest, { recursive: true });
  const staging = await mkdtemp(join(dest, ".fetch-"));
  const fetched: string[] = [];
  const kept: string[] = [];
  try {
    for (const source of lock.sources) {
      const expected = expectedDigest(source);
      if ((await treeDigest(join(dest, source.pack))) === expected) {
        kept.push(source.pack);
        continue;
      }
      if (source.type === "github") await fetchGithubSource(source, staging, githubBase);
      else await fetchFilesSource(source, staging);
      const actual = await treeDigest(join(staging, source.pack));
      if (actual !== expected) throw new Error(`${source.pack} : sha256 attendue ${expected}, obtenue ${actual}`);
      fetched.push(source.pack);
    }
    for (const pack of fetched) {
      await rm(join(dest, pack), { recursive: true, force: true });
      await rename(join(staging, pack), join(dest, pack));
    }
    return { fetched, kept };
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
