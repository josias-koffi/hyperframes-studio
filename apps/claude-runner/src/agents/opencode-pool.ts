import type { AgentRunner, AgentTurn } from "./types";

/** A running `opencode serve` of one client, and how to stop it. */
export type PooledServer = { runner: AgentRunner; stop(): void; onExit(listener: () => void): void };

/**
 * One OpenCode server per client uid: its tools run as that client, so two clients never share a process. A server
 * starts with the client's first turn and stops after `idleMs` without one; past `max` servers, the idle one
 * unused for the longest is stopped first. A server that dies is forgotten, and the next turn starts another.
 */
export function createOpencodePool({
  start,
  idleMs = 60 * 1000,
  max,
  log = (text: string) => console.log(`[claude-runner] ${text}`),
}: {
  start: (uid: number) => Promise<PooledServer>;
  idleMs?: number;
  max: number;
  log?: (text: string) => void;
}) {
  type Entry = { server: Promise<PooledServer>; busy: number; lastUsed: number; idleTimer?: NodeJS.Timeout };
  const entries = new Map<number, Entry>();

  const stop = (uid: number, entry: Entry, reason: string) => {
    if (entries.get(uid) !== entry) return;
    entries.delete(uid);
    clearTimeout(entry.idleTimer);
    log(`opencode server of agent ${uid} stopped (${reason})`);
    entry.server.then((server) => server.stop()).catch(() => undefined);
  };

  const evictIdle = () => {
    while (entries.size >= max) {
      const idle = [...entries].filter(([, entry]) => entry.busy === 0).sort(([, a], [, b]) => a.lastUsed - b.lastUsed)[0];
      if (!idle) return;
      stop(idle[0], idle[1], "pool full");
    }
  };

  const acquire = (uid: number): Entry => {
    let entry = entries.get(uid);
    if (!entry) {
      evictIdle();
      const created: Entry = { server: start(uid), busy: 0, lastUsed: Date.now() };
      entry = created;
      entries.set(uid, created);
      created.server.then(
        (server) => server.onExit(() => stop(uid, created, "exited")),
        () => entries.get(uid) === created && entries.delete(uid),
      );
    }
    clearTimeout(entry.idleTimer);
    entry.busy += 1;
    return entry;
  };

  const release = (uid: number, entry: Entry) => {
    entry.busy -= 1;
    entry.lastUsed = Date.now();
    if (entry.busy === 0 && entries.get(uid) === entry) {
      entry.idleTimer = setTimeout(() => stop(uid, entry, "idle"), idleMs);
      entry.idleTimer.unref?.();
    }
  };

  return {
    /** The OpenCode runner of the turn's client. */
    runner: {
      async run(turn: AgentTurn) {
        const entry = acquire(turn.agentUid);
        try {
          return await (await entry.server).runner.run(turn);
        } finally {
          release(turn.agentUid, entry);
        }
      },
    } satisfies AgentRunner,
    size: () => entries.size,
    stopAll() {
      for (const [uid, entry] of [...entries]) stop(uid, entry, "shutdown");
    },
  };
}
