import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { digestOfFiles, directorySize, fetchLibrary, libraryVersion, treeDigest } from "./library-fetch";
import { libraryLockSchema, type LibraryLock } from "./library";

const COMMIT = "c".repeat(40);
const sha = (content: string | Buffer) => createHash("sha256").update(content).digest("hex");

let root: string;
let dest: string;
let server: Server;
let base: string;
let requests: string[];
let routes: Map<string, Buffer>;

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "library-fetch-"));
  dest = join(root, "library");
  requests = [];
  routes = new Map();
  server = createServer((request, response) => {
    requests.push(request.url ?? "");
    const body = routes.get(request.url ?? "");
    response.statusCode = body ? 200 : 404;
    response.end(body ?? "absent");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
  rmSync(root, { recursive: true, force: true });
});

/** A tarball shaped like GitHub's: everything under one top folder, with a symlink pointing out of the archive. */
function tarball(files: Record<string, string>): Buffer {
  const top = join(root, "src", "repo-abc");
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(top, path, ".."), { recursive: true });
    writeFileSync(join(top, path), content);
  }
  symlinkSync("/etc/passwd", join(top, "flags-link.svg"));
  const archive = join(root, "repo.tar.gz");
  execFileSync("tar", ["-czf", archive, "-C", join(root, "src"), "repo-abc"]);
  return readFileSync(archive);
}

const REPO_FILES = { "flags/4x3/fr.svg": "<svg>fr</svg>", "flags/4x3/de.svg": "<svg>de</svg>", "flags/1x1/fr.svg": "<svg>carré</svg>", LICENSE: "MIT" };
const INCLUDE = ["flags/4x3/*.svg", "LICENSE", "*-link.svg"];
const expected = digestOfFiles([
  { path: "LICENSE", sha256: sha("MIT") },
  { path: "flags/4x3/de.svg", sha256: sha("<svg>de</svg>") },
  { path: "flags/4x3/fr.svg", sha256: sha("<svg>fr</svg>") },
]);

function githubLock(digest = expected): LibraryLock {
  routes.set(`/lipis/flag-icons/tar.gz/${COMMIT}`, tarball(REPO_FILES));
  return libraryLockSchema.parse({
    version: 1,
    sources: [{ pack: "flags", type: "github", repo: "lipis/flag-icons", commit: COMMIT, license: "MIT", licenseFile: "LICENSE", include: INCLUDE, sha256: digest }],
  });
}

function filesLock(content: string, declared = content): LibraryLock {
  routes.set("/peep.svg", Buffer.from(content));
  return libraryLockSchema.parse({
    version: 1,
    sources: [{ pack: "peeps", type: "files", license: "CC0-1.0", files: [{ url: `${base}/peep.svg`, path: "a/peep.svg", sha256: sha(declared) }] }],
  });
}

describe("fetchLibrary", () => {
  it("installs only the selected regular files of a GitHub source", async () => {
    const result = await fetchLibrary({ lock: githubLock(), dest, githubBase: base });
    expect(result).toEqual({ fetched: ["flags"], kept: [] });
    expect(readFileSync(join(dest, "flags/flags/4x3/fr.svg"), "utf8")).toBe("<svg>fr</svg>");
    expect(existsSync(join(dest, "flags/flags/1x1/fr.svg"))).toBe(false);
    expect(existsSync(join(dest, "flags/flags-link.svg"))).toBe(false);
    expect(await treeDigest(join(dest, "flags"))).toBe(expected);
  });

  it("installs a list of files", async () => {
    await fetchLibrary({ lock: filesLock("<svg/>"), dest, githubBase: base });
    expect(readFileSync(join(dest, "peeps/a/peep.svg"), "utf8")).toBe("<svg/>");
  });

  it("fails on a digest that differs, naming both values, and installs nothing", async () => {
    const wrong = "d".repeat(64);
    await expect(fetchLibrary({ lock: githubLock(wrong), dest, githubBase: base })).rejects.toThrow(new RegExp(`${wrong}.*${expected}`));
    expect(readdirSync(dest)).toEqual([]);
  });

  it("fails on a file whose content changed", async () => {
    await expect(fetchLibrary({ lock: filesLock("modifié", "original"), dest, githubBase: base })).rejects.toThrow("a/peep.svg");
    expect(readdirSync(dest)).toEqual([]);
  });

  it("keeps the packs already installed when another one fails", async () => {
    await fetchLibrary({ lock: filesLock("<svg/>"), dest, githubBase: base });
    const broken = libraryLockSchema.parse({
      version: 1,
      sources: [{ pack: "peeps", type: "files", license: "CC0-1.0", files: [{ url: `${base}/absent.svg`, path: "a/peep.svg", sha256: sha("autre") }] }],
    });
    await expect(fetchLibrary({ lock: broken, dest, githubBase: base })).rejects.toThrow("404");
    expect(readFileSync(join(dest, "peeps/a/peep.svg"), "utf8")).toBe("<svg/>");
  });

  it("downloads nothing when the pack is already intact", async () => {
    const lock = githubLock();
    await fetchLibrary({ lock, dest, githubBase: base });
    requests.length = 0;
    expect(await fetchLibrary({ lock, dest, githubBase: base })).toEqual({ fetched: [], kept: ["flags"] });
    expect(requests).toEqual([]);
  });

  it("replaces a pack altered on disk", async () => {
    const lock = githubLock();
    await fetchLibrary({ lock, dest, githubBase: base });
    writeFileSync(join(dest, "flags/flags/4x3/fr.svg"), "altéré");
    writeFileSync(join(dest, "flags/flags/4x3/extra.svg"), "en trop");
    await fetchLibrary({ lock, dest, githubBase: base });
    expect(readFileSync(join(dest, "flags/flags/4x3/fr.svg"), "utf8")).toBe("<svg>fr</svg>");
    expect(existsSync(join(dest, "flags/flags/4x3/extra.svg"))).toBe(false);
  });

  it("leaves the catalog of the library alone", async () => {
    mkdirSync(dest, { recursive: true });
    writeFileSync(join(dest, "catalog.json"), "{}");
    await fetchLibrary({ lock: filesLock("<svg/>"), dest, githubBase: base });
    expect(readFileSync(join(dest, "catalog.json"), "utf8")).toBe("{}");
    expect(readdirSync(dest).sort()).toEqual(["catalog.json", "packs.sha256", "peeps"]);
  });

  it("writes the manifest of the packs", async () => {
    await fetchLibrary({ lock: githubLock(), dest, githubBase: base });
    expect(readFileSync(join(dest, "packs.sha256"), "utf8")).toBe(`${expected}  flags\n`);
  });

  it("removes a pack taken out of the lock", async () => {
    await fetchLibrary({ lock: githubLock(), dest, githubBase: base });
    await fetchLibrary({ lock: filesLock("<svg/>"), dest, githubBase: base });
    expect(readdirSync(dest).sort()).toEqual(["packs.sha256", "peeps"]);
  });

  it("refuses a folder that is not a library", async () => {
    mkdirSync(dest, { recursive: true });
    writeFileSync(join(dest, "précieux.txt"), "à garder");
    await expect(fetchLibrary({ lock: filesLock("<svg/>"), dest, githubBase: base })).rejects.toThrow("bibliothèque");
    expect(readdirSync(dest)).toEqual(["précieux.txt"]);
  });

  it("fails when a GitHub source selects nothing", async () => {
    const lock = githubLock();
    const source = lock.sources[0];
    if (source?.type !== "github") throw new Error("source GitHub attendue");
    await expect(fetchLibrary({ lock: { ...lock, sources: [{ ...source, include: ["absent/*.svg"] }] }, dest, githubBase: base })).rejects.toThrow("flags");
  });
});

describe("digests", () => {
  it("does not depend on the order of the files", () => {
    const a = { path: "a.svg", sha256: sha("a") };
    const b = { path: "b.svg", sha256: sha("b") };
    expect(digestOfFiles([a, b])).toBe(digestOfFiles([b, a]));
  });

  it("changes when a file is renamed", () => {
    expect(digestOfFiles([{ path: "a.svg", sha256: sha("a") }])).not.toBe(digestOfFiles([{ path: "b.svg", sha256: sha("a") }]));
  });

  it("has no digest for a missing folder", async () => {
    expect(await treeDigest(join(root, "absent"))).toBeNull();
  });
});

describe("libraryVersion", () => {
  it("changes with the catalog and with the packs, not with anything else", async () => {
    mkdirSync(dest, { recursive: true });
    expect(await libraryVersion(dest)).toBeNull();
    writeFileSync(join(dest, "catalog.json"), "{}");
    const first = await libraryVersion(dest);
    writeFileSync(join(dest, "notes.txt"), "rien");
    expect(await libraryVersion(dest)).toBe(first);
    writeFileSync(join(dest, "packs.sha256"), "x  flags\n");
    const second = await libraryVersion(dest);
    expect(second).not.toBe(first);
    writeFileSync(join(dest, "catalog.json"), "{ }");
    expect(await libraryVersion(dest)).not.toBe(second);
  });

  it("measures the files of a folder", async () => {
    mkdirSync(join(dest, "a"), { recursive: true });
    writeFileSync(join(dest, "a/b.svg"), "12345");
    writeFileSync(join(dest, "c.svg"), "678");
    expect(await directorySize(dest)).toBe(8);
  });
});
