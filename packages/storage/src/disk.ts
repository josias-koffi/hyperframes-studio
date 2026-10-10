import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createWriteStream } from "node:fs";
import { copyFile, mkdir, rm, stat } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Storage } from "./client";

export type DiskStorageConfig = {
  dir: string;
  /** Base of the presigned URLs handed to the browser: the API, which serves them under `/files`. */
  publicUrl: string;
  /** Signs the presigned URLs. A random one makes them die with the process, which is all a local app needs. */
  secret: string;
};

export function resolveDiskStorageConfig(env: NodeJS.ProcessEnv = process.env): DiskStorageConfig {
  return {
    dir: resolve(env.STORAGE_DIR?.trim() ?? ""),
    publicUrl: env.STORAGE_PUBLIC_URL?.trim() || env.API_URL?.trim() || "http://localhost:3343",
    secret: env.STORAGE_SECRET?.trim() || randomBytes(32).toString("hex"),
  };
}

export type FileOperation = "get" | "put";

/** What the API's `/files` route needs to serve a presigned URL of the disk storage. */
export type DiskFiles = {
  /** The file of a key, or null for a key that would leave the storage folder. */
  pathOf(key: string): string | null;
  /** Whether the query of a presigned URL grants `operation` on `key` now. */
  verify(operation: FileOperation, key: string, query: { expires?: string; signature?: string }): boolean;
  /** Writes an uploaded body as the file of `key`. */
  write(key: string, body: Readable): Promise<void>;
};

/** The files of the storage under one folder, with the S3 storage's methods: the desktop app has no MinIO. */
export function createDiskStorage(config: DiskStorageConfig): Storage {
  const root = resolve(config.dir);
  const publicUrl = config.publicUrl.replace(/\/+$/, "");

  const pathOf = (key: string) => {
    const path = resolve(root, key);
    return path.startsWith(root + sep) ? path : null;
  };
  const fileOf = (key: string) => {
    const path = pathOf(key);
    if (!path) throw new Error(`storage key outside the storage folder: ${key}`);
    return path;
  };
  const sign = (operation: FileOperation, key: string, expires: number) =>
    createHmac("sha256", config.secret).update(`${operation}\n${key}\n${expires}`).digest("base64url");
  const presign = async (operation: FileOperation, key: string, expiresIn: number) => {
    const expires = Math.floor(Date.now() / 1000) + expiresIn;
    const url = new URL(`${publicUrl}/files/${key.split("/").map(encodeURIComponent).join("/")}`);
    url.searchParams.set("op", operation);
    url.searchParams.set("expires", String(expires));
    url.searchParams.set("signature", sign(operation, key, expires));
    return url.toString();
  };

  const files: DiskFiles = {
    pathOf,
    verify(operation, key, { expires, signature }) {
      const at = Number(expires);
      if (!signature || !Number.isInteger(at) || at < Date.now() / 1000) return false;
      const expected = Buffer.from(sign(operation, key, at));
      const actual = Buffer.from(signature);
      return expected.length === actual.length && timingSafeEqual(expected, actual);
    },
    async write(key, body) {
      const path = fileOf(key);
      await mkdir(dirname(path), { recursive: true });
      await pipeline(body, createWriteStream(path));
    },
  };

  return {
    bucket: root,
    async ensureBucket() {
      await mkdir(root, { recursive: true });
    },
    async uploadFile(key, path) {
      const target = fileOf(key);
      await mkdir(dirname(target), { recursive: true });
      await copyFile(path, target);
      return (await stat(target)).size;
    },
    async downloadToFile(key, path) {
      await mkdir(dirname(path), { recursive: true });
      await copyFile(fileOf(key), path);
    },
    async copy(fromKey, toKey) {
      const target = fileOf(toKey);
      await mkdir(dirname(target), { recursive: true });
      await copyFile(fileOf(fromKey), target);
    },
    async delete(key) {
      await rm(fileOf(key), { force: true });
    },
    presignUpload: (key, _contentType, expiresIn = 900) => presign("put", key, expiresIn),
    presignDownload: (key, expiresIn = 3600) => presign("get", key, expiresIn),
    files,
  };
}
