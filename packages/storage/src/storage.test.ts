import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createStorage } from "./storage";

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), "storage-"));
  return { dir, storage: createStorage({ dir, publicUrl: "http://127.0.0.1:4000/", secret: "s" }) };
}

const queryOf = (url: string) => {
  const params = new URL(url).searchParams;
  return { op: params.get("op"), expires: params.get("expires") ?? undefined, signature: params.get("signature") ?? undefined };
};

describe("createStorage", () => {
  it("copies, reads and deletes files under its folder", async () => {
    const { dir, storage } = await setup();
    const source = join(dir, "..", `source-${Date.now()}.txt`);
    await writeFile(source, "hello");
    expect(await storage.uploadFile("assets/a/hello.txt", source, "text/plain")).toBe(5);
    await storage.copy("assets/a/hello.txt", "assets/b/hello.txt");
    await storage.downloadToFile("assets/b/hello.txt", join(dir, "..", `copy-${Date.now()}.txt`));
    expect(await readFile(join(dir, "assets/b/hello.txt"), "utf8")).toBe("hello");
    await storage.delete("assets/a/hello.txt");
    await expect(readFile(join(dir, "assets/a/hello.txt"))).rejects.toThrow();
  });

  it("presigns URLs on the API's /files that grant one operation on one key until they expire", async () => {
    const { storage } = await setup();
    const url = await storage.presignUpload("assets/a/clip one.mp4", "video/mp4");
    expect(url.startsWith("http://127.0.0.1:4000/files/assets/a/clip%20one.mp4?op=put&")).toBe(true);
    const files = storage.files;
    const query = queryOf(url);
    expect(files.verify("put", "assets/a/clip one.mp4", query)).toBe(true);
    expect(files.verify("get", "assets/a/clip one.mp4", query)).toBe(false);
    expect(files.verify("put", "assets/b/clip one.mp4", query)).toBe(false);
    expect(files.verify("put", "assets/a/clip one.mp4", { ...query, signature: "x" })).toBe(false);
    const expired = queryOf(await storage.presignDownload("assets/a/x.png", -1));
    expect(files.verify("get", "assets/a/x.png", expired)).toBe(false);
  });

  it("writes an uploaded body, and refuses keys that leave the folder", async () => {
    const { dir, storage } = await setup();
    await storage.files.write("renders/c/r/out.png", Readable.from(["png"]));
    expect(await readFile(join(dir, "renders/c/r/out.png"), "utf8")).toBe("png");
    expect(storage.files.pathOf("../outside.txt")).toBeNull();
    await expect(storage.delete("../../etc/passwd")).rejects.toThrow("outside");
  });
});
