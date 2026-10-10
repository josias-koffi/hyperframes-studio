import { EventEmitter } from "node:events";
import type { Publish } from "./job-reporter";

export type JobHandler = (data: unknown) => Promise<unknown>;

export type WorkOptions = {
  concurrency: number;
  onFailed?: (jobId: string | undefined, error: Error) => void;
};

/** The jobs queued by the API and run by the workers, and the live channel of their events: all in one process. */
export type JobBus = {
  /** `jobId` is the job's row: a job is queued once. */
  add(queue: string, name: string, data: object, jobId: string): Promise<void>;
  work(queue: string, handler: JobHandler, options: WorkOptions): { close(): Promise<void> };
  publish: Publish;
  /** Resolves once subscribed: what is published from then on reaches `onMessage`. Returns the unsubscribe. */
  subscribe(channel: string, onMessage: (message: string) => void): Promise<() => void>;
};

type MemoryJob = { name: string; data: object; jobId: string };
type MemoryWorker = { handler: JobHandler; options: WorkOptions; running: number; closed: boolean; idle: Set<() => void> };

const SHARED_BUS = Symbol.for("studio.jobBus");

/**
 * One per process, shared by the API and the workers it runs. Jobs live as long as the process: the core marks the
 * ones a quit interrupted as failed when it starts again.
 */
export function createJobBus(): JobBus {
  const global = globalThis as { [SHARED_BUS]?: JobBus };
  return (global[SHARED_BUS] ??= createMemoryJobBus());
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
      // Never inside the caller's turn: the API answers before the job starts.
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
  };
}
