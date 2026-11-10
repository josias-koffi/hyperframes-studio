import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { grantedDirs, grantedDirsNote, stringsOf } from "./granted-dirs";

describe("grantedDirs", () => {
  let home: string;

  beforeEach(async () => {
    home = await realpath(await mkdtemp(join(tmpdir(), "granted-")));
    await mkdir(join(home, "Documents", "open peeps"), { recursive: true });
    await mkdir(join(home, "Documents", "logos"), { recursive: true });
    await mkdir(join(home, ".ssh"));
    await writeFile(join(home, "Documents", "logos", "logo.svg"), "<svg/>");
    await writeFile(join(home, "note.txt"), "x");
  });

  afterEach(() => rm(home, { recursive: true, force: true }));

  it("opens a folder named in the text, even followed by punctuation", async () => {
    expect(await grantedDirs([`Prends les logos dans ${home}/Documents/logos.`], home)).toEqual([join(home, "Documents/logos")]);
  });

  it("reads quoted paths with spaces, and ~", async () => {
    expect(await grantedDirs([`dans \`${home}/Documents/open peeps\``], home)).toEqual([join(home, "Documents/open peeps")]);
    expect(await grantedDirs(["va voir ~/Documents/logos"], home)).toEqual([join(home, "Documents/logos")]);
  });

  it("opens the folder of a named file", async () => {
    expect(await grantedDirs([`${home}/Documents/logos/logo.svg`], home)).toEqual([join(home, "Documents/logos")]);
  });

  it("names a folder once", async () => {
    expect(await grantedDirs([`${home}/Documents/logos`, `~/Documents/logos`], home)).toHaveLength(1);
  });

  it.each([
    ["the home itself", (h: string) => h],
    ["a file directly in the home", (h: string) => `${h}/note.txt`],
    ["a hidden folder", (h: string) => `${h}/.ssh`],
    ["a folder that does not exist", (h: string) => `${h}/nope`],
    ["a system folder", () => "/etc"],
    ["the root", () => "/"],
  ])("ignores %s", async (_name, path) => {
    expect(await grantedDirs([`voir ${path(home)}`], home)).toEqual([]);
  });

  it("does not follow a link into a hidden folder", async () => {
    await symlink(join(home, ".ssh"), join(home, "Documents", "cles"));
    expect(await grantedDirs([`${home}/Documents/cles`], home)).toEqual([]);
  });

  it("does not take the path of a URL for a folder", async () => {
    expect(await grantedDirs(["https://example.com/etc"], home)).toEqual([]);
  });
});

describe("stringsOf", () => {
  it("collects the strings of nested values", () => {
    expect(stringsOf({ a: "x", b: [{ c: "y" }, 1], d: null })).toEqual(["x", "y"]);
  });
});

describe("grantedDirsNote", () => {
  it("is empty without a folder", () => {
    expect(grantedDirsNote([], "v")).toBe("");
  });

  it("lists the folders and where to copy", () => {
    const note = grantedDirsNote(["/home/a/logos"], "v");
    expect(note).toContain("- /home/a/logos");
    expect(note).toContain("videos/v/assets/uploads/");
  });
});
