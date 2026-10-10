import { describe, expect, it } from "vitest";
import { createJobBus, createMemoryJobBus } from "./job-bus";

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

describe("createMemoryJobBus", () => {
  it("runs the jobs queued before a worker exists, once each, no more at a time than its concurrency", async () => {
    const bus = createMemoryJobBus();
    await bus.add("q", "a", { n: 1 }, "j1");
    await bus.add("q", "a", { n: 1 }, "j1");
    await bus.add("q", "b", { n: 2 }, "j2");
    await bus.add("q", "c", { n: 3 }, "j3");
    const seen: number[] = [];
    let running = 0;
    let peak = 0;
    bus.work(
      "q",
      async (data) => {
        running += 1;
        peak = Math.max(peak, running);
        await tick();
        seen.push((data as { n: number }).n);
        running -= 1;
      },
      { concurrency: 2 },
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(seen.sort()).toEqual([1, 2, 3]);
    expect(peak).toBe(2);
  });

  it("reports a failed job and goes on with the next", async () => {
    const bus = createMemoryJobBus();
    const failed: string[] = [];
    const done: string[] = [];
    bus.work(
      "q",
      async (data) => {
        if ((data as { fail?: boolean }).fail) throw new Error("boom");
        done.push("ok");
      },
      { concurrency: 1, onFailed: (jobId, error) => failed.push(`${jobId}: ${error.message}`) },
    );
    await bus.add("q", "x", { fail: true }, "j1");
    await bus.add("q", "x", {}, "j2");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(failed).toEqual(["j1: boom"]);
    expect(done).toEqual(["ok"]);
  });

  it("waits for the running job when a worker closes, and leaves the rest queued", async () => {
    const bus = createMemoryJobBus();
    const done: string[] = [];
    const worker = bus.work(
      "q",
      async (data) => {
        await tick();
        done.push((data as { id: string }).id);
      },
      { concurrency: 1 },
    );
    await bus.add("q", "x", { id: "a" }, "a");
    await bus.add("q", "x", { id: "b" }, "b");
    await tick();
    await worker.close();
    expect(done).toEqual(["a"]);
  });

  it("delivers what is published after subscribing, until unsubscribed", async () => {
    const bus = createMemoryJobBus();
    const got: string[] = [];
    await bus.publish("c", "before");
    const off = await bus.subscribe("c", (message) => got.push(message));
    await bus.publish("c", "one");
    await bus.publish("other", "elsewhere");
    off();
    await bus.publish("c", "after");
    expect(got).toEqual(["one"]);
  });

  it("is one per process with REDIS_URL=memory: the API and the workers share it", () => {
    expect(createJobBus({ REDIS_URL: "memory" })).toBe(createJobBus({ REDIS_URL: "memory" }));
  });
});
