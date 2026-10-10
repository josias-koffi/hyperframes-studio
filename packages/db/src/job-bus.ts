import { EventEmitter } from "node:events";
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import type { Publish } from "./job-reporter";

export type JobHandler = (data: unknown) => Promise<unknown>;

export type WorkOptions = {
  concurrency: number;
  /** How long a job may run before Redis takes it for stalled (Redis only). */
  lockDuration?: number;
  /** How many times a stalled job runs again (Redis only). */
  maxStalledCount?: number;
  onFailed?: (jobId: string | undefined, error: Error) => void;
};

/**
 * The jobs queued by the API and run by the workers, and the live channel of their events. Redis (BullMQ) on the
 * servers, where each runs in its own container; in memory in the desktop app, where they share one process.
 */
export type JobBus = {
  /** `jobId` is the job's row: a job is queued once. */
  add(queue: string, name: string, data: object, jobId: string): Promise<void>;
  work(queue: string, handler: JobHandler, options: WorkOptions): { close(): Promise<void> };
  publish: Publish;
  /** Resolves once subscribed: what is published from then on reaches `onMessage`. Returns the unsubscribe. */
  subscribe(channel: string, onMessage: (message: string) => void): Promise<() => void>;
  ping(): Promise<void>;
  close(): Promise<void>;
};

/** `REDIS_URL=memory`: the API and the workers run in the same process (the desktop app). */
export function createJobBus(env: NodeJS.ProcessEnv = process.env): JobBus {
  const url = env.REDIS_URL?.trim() || "redis://localhost:6390";
  return url === "memory" ? memoryJobBus() : createRedisJobBus(url);
}

export function createRedisJobBus(url: string): JobBus {
  const connection = new IORedis(url, { maxRetriesPerRequest: null });
  const publisher = new IORedis(url);
  const queues = new Map<string, Queue>();
  const queue = (name: string) => {
    let found = queues.get(name);
    if (!found) queues.set(name, (found = new Queue(name, { connection })));
    return found;
  };

  return {
    async add(name, jobName, data, jobId) {
      await queue(name).add(jobName, data, { jobId });
    },
    work(name, handler, { onFailed, ...options }) {
      const worker = new Worker(name, (job) => handler(job.data), { connection, ...options });
      if (onFailed) worker.on("failed", (job, error) => onFailed(job?.id, error));
      return { close: () => worker.close() };
    },
    publish: (channel, message) => publisher.publish(channel, message),
    async subscribe(channel, onMessage) {
      const subscriber = connection.duplicate();
      subscriber.on("message", (_channel: string, message: string) => onMessage(message));
      await subscriber.subscribe(channel);
      return () => subscriber.disconnect();
    },
    async ping() {
      await connection.ping();
    },
    async close() {
      await Promise.all([...queues.values()].map((found) => found.close()));
      publisher.disconnect();
      connection.disconnect();
    },
  };
}

type MemoryJob = { name: string; data: object; jobId: string };
type MemoryWorker = { handler: JobHandler; options: WorkOptions; running: number; closed: boolean; idle: Set<() => void> };

const MEMORY_BUS = Symbol.for("studio.memoryJobBus");

/**
 * One per process, shared by the API and the workers it runs. Jobs live as long as the process: one queued or
 * running when the app quits is lost, as a stalled one is on Redis (`maxStalledCount: 0`).
 */
function memoryJobBus(): JobBus {
  const global = globalThis as { [MEMORY_BUS]?: JobBus };
  return (global[MEMORY_BUS] ??= createMemoryJobBus());
}

export function createMemoryJobBus(): JobBus {
  const pending = new Map<string, MemoryJob[]>();
  const workers = new Map<string, MemoryWorker[]>();
  const channels = new EventEmitter().setMaxListeners(0);

  const drain = (queue: string) => {
    const jobs = pending.get(queue) ?? [];
    for (const worker of workers.get(queue) ?? []) {
      while (!worker.closed && worker.running < worker.options.concurrency && jobs.length) {
        const job = jobs.shift() as MemoryJob;
        worker.running += 1;
        worker
          .handler(job.data)
          .catch((error: unknown) => worker.options.onFailed?.(job.jobId, error instanceof Error ? error : new Error(String(error))))
          .finally(() => {
            worker.running -= 1;
            if (worker.running === 0) worker.idle.forEach((resolve) => resolve());
            drain(queue);
          });
      }
    }
  };

  return {
    async add(queue, name, data, jobId) {
      const jobs = pending.get(queue) ?? [];
      pending.set(queue, jobs);
      if (jobs.some((job) => job.jobId === jobId)) return;
      jobs.push({ name, data, jobId });
      // Never inside the caller's turn: BullMQ hands the job over later too.
      setImmediate(() => drain(queue));
    },
    work(queue, handler, options) {
      const worker: MemoryWorker = { handler, options, running: 0, closed: false, idle: new Set() };
      workers.set(queue, [...(workers.get(queue) ?? []), worker]);
      setImmediate(() => drain(queue));
      return {
        close() {
          worker.closed = true;
          workers.set(queue, (workers.get(queue) ?? []).filter((other) => other !== worker));
          return worker.running === 0 ? Promise.resolve() : new Promise<void>((resolve) => worker.idle.add(resolve));
        },
      };
    },
    async publish(channel, message) {
      return channels.emit(channel, message);
    },
    async subscribe(channel, onMessage) {
      channels.on(channel, onMessage);
      return () => channels.off(channel, onMessage);
    },
    async ping() {},
    async close() {},
  };
}
