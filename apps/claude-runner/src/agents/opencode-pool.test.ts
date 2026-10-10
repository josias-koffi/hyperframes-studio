import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { createOpencodePool, type PooledServer } from "./opencode-pool";
import type { AgentTurn } from "./types";

const turn = (agentUid: number): AgentTurn => ({ prompt: "p", sessionId: null, model: "m", cwd: "/ws", agentUid, timeoutMs: 1_000, onEvent: () => undefined });

/** Servers that answer with the uid they run as; `exit(uid)` kills one. */
function fakeServers() {
  const started: number[] = [];
  const stopped: number[] = [];
  const exits = new Map<number, EventEmitter>();
  const start = vi.fn(async (uid: number): Promise<PooledServer> => {
    started.push(uid);
    const events = new EventEmitter();
    exits.set(uid, events);
    return {
      runner: { run: async () => ({ ok: true, sessionId: `ses_${uid}`, resultText: String(uid) }) },
      stop: () => void stopped.push(uid),
      onExit: (listener) => void events.on("exit", listener),
    };
  });
  return { start, started, stopped, exit: (uid: number) => exits.get(uid)?.emit("exit") };
}

describe("createOpencodePool", () => {
  it("runs each client's turns on its own server, started once", async () => {
    const servers = fakeServers();
    const pool = createOpencodePool({ start: servers.start, max: 4, log: () => undefined });
    expect((await pool.runner.run(turn(100001))).resultText).toBe("100001");
    expect((await pool.runner.run(turn(100002))).resultText).toBe("100002");
    expect((await pool.runner.run(turn(100001))).resultText).toBe("100001");
    expect(servers.started).toEqual([100001, 100002]);
    pool.stopAll();
  });

  it("stops a server once idle, and the least recently used idle one when the pool is full", async () => {
    vi.useFakeTimers();
    try {
      const servers = fakeServers();
      const pool = createOpencodePool({ start: servers.start, max: 2, idleMs: 1_000, log: () => undefined });
      await pool.runner.run(turn(100001));
      await pool.runner.run(turn(100002));
      await pool.runner.run(turn(100003));
      expect(servers.stopped).toEqual([100001]);
      await vi.advanceTimersByTimeAsync(1_001);
      expect(servers.stopped).toEqual([100001, 100002, 100003]);
      expect(pool.size()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("forgets a server that died, and starts another for the next turn", async () => {
    const servers = fakeServers();
    const pool = createOpencodePool({ start: servers.start, max: 4, log: () => undefined });
    await pool.runner.run(turn(100001));
    servers.exit(100001);
    await Promise.resolve();
    expect(pool.size()).toBe(0);
    await pool.runner.run(turn(100001));
    expect(servers.started).toEqual([100001, 100001]);
    pool.stopAll();
  });

  it("starts again after a failed start", async () => {
    const servers = fakeServers();
    let fail = true;
    const pool = createOpencodePool({
      start: async (uid) => {
        if (fail) throw new Error("no sudo");
        return servers.start(uid);
      },
      max: 4,
      log: () => undefined,
    });
    await expect(pool.runner.run(turn(100001))).rejects.toThrow("no sudo");
    fail = false;
    expect((await pool.runner.run(turn(100001))).ok).toBe(true);
    pool.stopAll();
  });
});
