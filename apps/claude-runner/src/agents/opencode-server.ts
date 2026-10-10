import type { AgentRunner, AgentTurn } from "./types";

/** A running `opencode serve`, and how to stop it. */
export type RunningServer = { runner: AgentRunner; stop(): void; onExit(listener: () => void): void };

/**
 * The app's one OpenCode server: started by the first turn, stopped after `idleMs` without one (it holds up to a
 * gigabyte and starts again in about a second). A server that dies is forgotten, and the next turn starts another.
 */
export function createOpencodeServer({
  start,
  idleMs = 60 * 1000,
  log = (text: string) => console.log(`[claude-runner] ${text}`),
}: {
  start: () => Promise<RunningServer>;
  idleMs?: number;
  log?: (text: string) => void;
}) {
  type Current = { server: Promise<RunningServer>; busy: number; idleTimer?: NodeJS.Timeout };
  let current: Current | null = null;

  const stop = (entry: Current, reason: string) => {
    if (current !== entry) return;
    current = null;
    clearTimeout(entry.idleTimer);
    log(`opencode server stopped (${reason})`);
    entry.server.then((server) => server.stop()).catch(() => undefined);
  };

  const acquire = (): Current => {
    if (!current) {
      const created: Current = { server: start(), busy: 0 };
      current = created;
      created.server.then(
        (server) => server.onExit(() => stop(created, "exited")),
        () => {
          if (current === created) current = null;
        },
      );
    }
    clearTimeout(current.idleTimer);
    current.busy += 1;
    return current;
  };

  const release = (entry: Current) => {
    entry.busy -= 1;
    if (entry.busy === 0 && current === entry) {
      entry.idleTimer = setTimeout(() => stop(entry, "idle"), idleMs);
      entry.idleTimer.unref?.();
    }
  };

  return {
    runner: {
      async run(turn: AgentTurn) {
        const entry = acquire();
        try {
          return await (await entry.server).runner.run(turn);
        } finally {
          release(entry);
        }
      },
    } satisfies AgentRunner,
    running: () => current !== null,
    stop() {
      if (current) stop(current, "shutdown");
    },
  };
}
