import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { createOpencodeServer, type RunningServer } from "./opencode-server";
import type { AgentTurn } from "./types";

const turn: AgentTurn = { prompt: "p", sessionId: null, model: "m", cwd: "/ws", timeoutMs: 1_000, onEvent: () => undefined };

/** Servers numbered in start order; `exit()` kills the last one. */
function fakeServers() {
  let started = 0;
  let stopped = 0;
  const exits: EventEmitter[] = [];
  const start = vi.fn(async (): Promise<RunningServer> => {
    const id = ++started;
    const events = new EventEmitter();
    exits.push(events);
    return {
      runner: { run: async () => ({ ok: true, sessionId: `ses_${id}`, resultText: String(id) }) },
      stop: () => void (stopped += 1),
      onExit: (listener) => void events.on("exit", listener),
    };
  });
  return { start, started: () => started, stopped: () => stopped, exit: () => exits.at(-1)?.emit("exit") };
}

describe("createOpencodeServer", () => {
  it("starts one server for every turn", async () => {
    const servers = fakeServers();
    const opencode = createOpencodeServer({ start: servers.start, log: () => undefined });
    expect((await opencode.runner.run(turn)).resultText).toBe("1");
    expect((await opencode.runner.run(turn)).resultText).toBe("1");
    expect(servers.started()).toBe(1);
    opencode.stop();
  });

  it("stops the server once idle, and starts it again for the next turn", async () => {
    vi.useFakeTimers();
    try {
      const servers = fakeServers();
      const opencode = createOpencodeServer({ start: servers.start, idleMs: 1_000, log: () => undefined });
      await opencode.runner.run(turn);
      await vi.advanceTimersByTimeAsync(1_001);
      expect(servers.stopped()).toBe(1);
      expect(opencode.running()).toBe(false);
      expect((await opencode.runner.run(turn)).resultText).toBe("2");
      opencode.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("forgets a server that died", async () => {
    const servers = fakeServers();
    const opencode = createOpencodeServer({ start: servers.start, log: () => undefined });
    await opencode.runner.run(turn);
    servers.exit();
    await Promise.resolve();
    expect(opencode.running()).toBe(false);
    expect((await opencode.runner.run(turn)).resultText).toBe("2");
    opencode.stop();
  });

  it("starts again after a failed start", async () => {
    const servers = fakeServers();
    let fail = true;
    const opencode = createOpencodeServer({
      start: async () => {
        if (fail) throw new Error("no binary");
        return servers.start();
      },
      log: () => undefined,
    });
    await expect(opencode.runner.run(turn)).rejects.toThrow("no binary");
    fail = false;
    expect((await opencode.runner.run(turn)).ok).toBe(true);
    opencode.stop();
  });
});
