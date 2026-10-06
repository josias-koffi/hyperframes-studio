import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type StorageConfig = {
  endpoint: string;
  /** Public endpoint used in presigned URLs handed to the browser (defaults to `endpoint`). */
  publicEndpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

export function resolveStorageConfig(env: NodeJS.ProcessEnv = process.env): StorageConfig {
  const endpoint = env.S3_ENDPOINT?.trim() || "http://localhost:9120";
  return {
    endpoint,
    publicEndpoint: env.S3_PUBLIC_ENDPOINT?.trim() || endpoint,
    region: env.S3_REGION?.trim() || "us-east-1",
    bucket: env.S3_BUCKET?.trim() || "studio",
    accessKeyId: env.MINIO_ROOT_USER?.trim() || "studio",
    secretAccessKey: env.MINIO_ROOT_PASSWORD?.trim() || "studio-secret",
  };
}

function client(config: StorageConfig, endpoint: string): S3Client {
  return new S3Client({
    endpoint,
    region: config.region,
    forcePathStyle: true,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
}

export type Storage = ReturnType<typeof createStorage>;

export function createStorage(config: StorageConfig = resolveStorageConfig()) {
  const s3 = client(config, config.endpoint);
  const publicS3 = client(config, config.publicEndpoint);
  const Bucket = config.bucket;

  return {
    bucket: Bucket,

    async ensureBucket(): Promise<void> {
      try {
        await s3.send(new HeadBucketCommand({ Bucket }));
      } catch {
        await s3.send(new CreateBucketCommand({ Bucket }));
      }
    },

    async uploadFile(key: string, path: string, contentType: string): Promise<number> {
      const { size } = await stat(path);
      await s3.send(
        new PutObjectCommand({ Bucket, Key: key, Body: createReadStream(path), ContentType: contentType, ContentLength: size }),
      );
      return size;
    },

    async downloadToFile(key: string, path: string): Promise<void> {
      const response = await s3.send(new GetObjectCommand({ Bucket, Key: key }));
      if (!response.Body) throw new Error(`empty object ${key}`);
      await mkdir(dirname(path), { recursive: true });
      await pipeline(response.Body as Readable, createWriteStream(path));
    },

    presignUpload(key: string, contentType: string, expiresIn = 900): Promise<string> {
      return getSignedUrl(publicS3, new PutObjectCommand({ Bucket, Key: key, ContentType: contentType }), { expiresIn });
    },

    presignDownload(key: string, expiresIn = 3600): Promise<string> {
      return getSignedUrl(publicS3, new GetObjectCommand({ Bucket, Key: key }), { expiresIn });
    },
  };
}
