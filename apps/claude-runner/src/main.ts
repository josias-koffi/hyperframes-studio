import { randomBytes, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { createDatabaseClient, createJobBus, jobs } from "@studio/db";
import { claudeJobSchema, QUEUES, type AgentBackend, type ClaudeJob } from "@studio/shared";
import { createStorage } from "@studio/storage";
import { agentEnv } from "./agent-env";
import { createClaudeCodeRunner } from "./agents/claude-code";
import { createOpencodeHttpClient, createOpencodeRunner, startOpencodeServer } from "./agents/opencode";
import { createOpencodeServer } from "./agents/opencode-server";
import type { AgentRunner } from "./agents/types";
import { resolveRunnerConfig } from "./config";
import { createOpenrouterProxy } from "./openrouter-proxy";
import { processClaudeJob } from "./process-job";
import { syncWorkspaceSkeleton } from "./workspace";

/** What Claude Code needs from the studio's environment: the person's own session, not the database or storage. */
const CLAUDE_CODE_ENV = ["CLAUDE_CODE_OAUTH_TOKEN", "CLAUDE_CONFIG_DIR", "DISABLE_AUTOUPDATER", "SHELL", "USER"] as const;

/** Starts the worker of the generation steps; resolves with its stop. The app's core process calls it. */
export async function startClaudeRunner() {
  const config = resolveRunnerConfig();
  const bus = createJobBus();
  const { db, close } = createDatabaseClient();
  const storage = createStorage();
  const dirs = { home: homedir(), tmp: config.agentTmpDir };
  await mkdir(dirs.tmp, { recursive: true });

  if (config.skeletonDir) {
    await syncWorkspaceSkeleton(config.skeletonDir, config.workspaceDir);
    console.log(`[claude-runner] workspace skeleton synced into ${config.workspaceDir}`);
  }

  const proxy = config.openrouterApiKey
    ? createOpenrouterProxy({
        upstream: config.openrouterBaseUrl,
        apiKey: config.openrouterApiKey,
        fal: config.falApiKey ? { upstream: config.falQueueUrl, apiKey: config.falApiKey } : null,
      })
    : null;
  if (proxy) console.log(`[claude-runner] OpenRouter proxy on ${await proxy.start()}`);
  else console.warn("[claude-runner] OPENROUTER_API_KEY missing: OpenCode and the audio script cannot reach OpenRouter");
  if (!config.falApiKey) console.warn("[claude-runner] FAL_KEY missing: realistic créations cannot generate their shots");

  const enqueueNext = async (next: Omit<ClaudeJob, "jobId">) => {
    const jobId = randomUUID();
    await db.insert(jobs).values({ id: jobId, creationId: next.creationId, kind: "claude", step: next.step, input: next });
    await bus.add(QUEUES.claude, next.step, { ...next, jobId }, jobId);
  };

  // The person's own Claude Code subscription, through the `claude` command logged in on this machine.
  const claudeCode = createClaudeCodeRunner({
    bin: config.claudeBin,
    skillsDir: config.skillsDir,
    workspaceDir: config.workspaceDir,
    env: agentEnv(
      dirs,
      Object.fromEntries(CLAUDE_CODE_ENV.filter((key) => process.env[key]).map((key) => [key, process.env[key] as string])),
    ),
  });

  // One `opencode serve` for the app, behind a password of its own, started by the first OpenCode turn.
  const opencode = createOpencodeServer({
    idleMs: config.opencodeIdleMs,
    async start() {
      const password = randomBytes(24).toString("hex");
      const token = proxy?.grant();
      const { url, process: server } = await startOpencodeServer({
        bin: config.opencodeBin,
        cwd: config.workspaceDir,
        env: agentEnv(dirs, {
          OPENCODE_SERVER_PASSWORD: password,
          AGENT_SKILLS_DIR: config.skillsDir,
          ...(token ? { OPENROUTER_BASE_URL: token.baseUrl, OPENROUTER_API_KEY: token.token } : {}),
        }),
      });
      console.log(`[claude-runner] opencode server listening on ${url}`);
      server.on("exit", () => token?.revoke());
      return {
        runner: createOpencodeRunner(createOpencodeHttpClient(url, password)),
        stop: () => server.kill("SIGTERM"),
        onExit: (listener) => server.on("exit", listener),
      };
    },
  });
  const runners: Record<AgentBackend, AgentRunner> = { "claude-code": claudeCode, opencode: opencode.runner };

  // Claude Code turns stay one at a time inside their runner: the subscription quota is shared by every job.
  const worker = bus.work(
    QUEUES.claude,
    async (data) =>
      processClaudeJob(claudeJobSchema.parse(data), {
        config,
        db,
        storage,
        publish: bus.publish,
        enqueueNext,
        runnerFor: (backend) => runners[backend],
        proxy,
      }),
    {
      concurrency: config.concurrency,
      onFailed: (jobId, error) => console.error(`[claude-runner] job ${jobId} failed:`, error.message),
    },
  );
  console.log(`[claude-runner] listening on ${QUEUES.claude}`);

  return {
    async close() {
      await worker.close();
      opencode.stop();
      await proxy?.close();
      await close();
    },
  };
}
