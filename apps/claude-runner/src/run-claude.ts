import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { parseClaudeStreamLine, type StudioEvent } from "@studio/shared";

export type ClaudeRunResult = {
  ok: boolean;
  sessionId: string | null;
  resultText: string | null;
  exitCode: number | null;
};

export type RunClaudeOptions = {
  bin: string;
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs: number;
  /**
   * How long Claude may stay silent after a `result` line before it is stopped. A turn that started
   * background agents can keep the process open once everything is done; the last result stands.
   */
  settleMs?: number;
  onEvent: (event: StudioEvent) => Promise<void> | void;
};

/**
 * Runs one headless Claude Code turn and streams its events. Events are
 * forwarded in order (each `onEvent` is awaited before the next line), and the
 * run only counts as successful when Claude's own `result` line says so.
 */
export function runClaude({ bin, args, cwd, env, timeoutMs, settleMs = 60_000, onEvent }: RunClaudeOptions): Promise<ClaudeRunResult> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(bin, args, { cwd, env: env ?? process.env, stdio: ["ignore", "pipe", "pipe"] });
    let sessionId: string | null = null;
    let result: StudioEvent & { kind: "result" } | null = null;
    let chain = Promise.resolve();
    let stderr = "";
    let timedOut = false;
    let settled = false;
    let settleTimer: NodeJS.Timeout | undefined;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    const forward = (event: StudioEvent) => {
      if (event.kind === "session") sessionId = event.sessionId;
      if (event.kind === "result") {
        result = event;
        sessionId = event.sessionId ?? sessionId;
      }
      chain = chain.then(() => onEvent(event));
    };

    // Any output after a result means Claude is still working: the silence window starts over.
    const armSettle = () => {
      clearTimeout(settleTimer);
      if (!result) return;
      settleTimer = setTimeout(() => {
        settled = true;
        forward({ kind: "log", level: "info", text: `Claude still running ${settleMs / 1000} s after its result: stopped.` });
        child.kill("SIGTERM");
      }, settleMs);
    };

    createInterface({ input: child.stdout }).on("line", (line) => {
      parseClaudeStreamLine(line).forEach(forward);
      armSettle();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-4000);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      clearTimeout(settleTimer);
      reject(error);
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      clearTimeout(settleTimer);
      if (timedOut) forward({ kind: "log", level: "error", text: `Claude step timed out after ${timeoutMs} ms` });
      else if (exitCode !== 0 && !settled && stderr.trim()) forward({ kind: "log", level: "error", text: stderr.trim() });
      chain
        .then(() => {
          const final = result as (StudioEvent & { kind: "result" }) | null;
          resolvePromise({
            ok: !timedOut && (exitCode === 0 || settled) && final?.ok === true,
            sessionId,
            resultText: final?.text ?? (stderr.trim() || null),
            exitCode,
          });
        })
        .catch(reject);
    });
  });
}
