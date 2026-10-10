import { randomBytes, randomUUID } from "node:crypto";
import { chmod } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { createDatabaseClient, createJobBus, creations, jobs, projects, users } from "@studio/db";
import { claudeJobSchema, loadEnvironmentFiles, QUEUES, type AgentBackend, type ClaudeJob } from "@studio/shared";
import { createStorage } from "@studio/storage";
import { eq } from "drizzle-orm";
import { createClaudeCodeRunner } from "./agents/claude-code";
import { createOpencodeHttpClient, createOpencodeRunner, startOpencodeServer } from "./agents/opencode";
import { createOpencodePool } from "./agents/opencode-pool";
import type { AgentRunner } from "./agents/types";
import { resolveRunnerConfig } from "./config";
import { createOpenrouterProxy } from "./openrouter-proxy";
import { processClaudeJob } from "./process-job";
import { agentEnv, agentIdentity, checkSandbox, grantFolder, LEGACY_AGENT_UID, lockWorkspace, prepareAgentHome, type Sandbox } from "./sandbox";
import { syncWorkspaceSkeleton } from "./workspace";

/** What Claude Code needs from the runner's environment: its subscription token, not the database or storage. */
const CLAUDE_CODE_ENV = ["CLAUDE_CODE_OAUTH_TOKEN", "CLAUDE_CONFIG_DIR", "DISABLE_AUTOUPDATER", "SHELL", "USER"] as const;

/** Starts the worker; resolves with its stop. The desktop app's core process calls it, next to the API. */
export async function startClaudeRunner() {
  const config = resolveRunnerConfig();
  const bus = createJobBus();
  const { db, close } = createDatabaseClient();
  const storage = createStorage();

  const sandbox: Sandbox = {
    mode: config.sandbox,
    agentExec: config.agentExec,
    agentsDir: config.agentsDir,
    skillsDir: config.skillsDir,
    browserDir: config.browserDir,
    serviceUid: process.getuid?.() ?? 1000,
  };
  await checkSandbox(sandbox);
  if (sandbox.mode === "off") console.warn("[claude-runner] AGENT_SANDBOX=off: agents run as this user and can read every video");

  if (config.skeletonDir) {
    await syncWorkspaceSkeleton(config.skeletonDir, config.workspaceDir, { withKey: sandbox.mode === "off" });
    console.log(`[claude-runner] workspace skeleton synced into ${config.workspaceDir}`);
  }
  if (sandbox.mode === "uid") {
    const owners = await db
      .select({ slug: creations.slug, agentUid: users.agentUid })
      .from(creations)
      .innerJoin(projects, eq(projects.id, creations.projectId))
      .leftJoin(users, eq(users.id, projects.ownerId));
    const uidOf = new Map(owners.map((owner) => [owner.slug, owner.agentUid ?? LEGACY_AGENT_UID]));
    await lockWorkspace(sandbox, config.workspaceDir, (slug) => uidOf.get(slug));
    // Claude Code's sessions hold the admin's prompts: no agent reads them.
    await chmod(join(homedir(), ".claude", "projects"), 0o700).catch(() => undefined);
    console.log(`[claude-runner] workspace locked: ${uidOf.size} video folders granted to their owner`);
  }

  const proxy = config.openrouterApiKey ? createOpenrouterProxy({ upstream: config.openrouterBaseUrl, apiKey: config.openrouterApiKey }) : null;
  if (proxy) console.log(`[claude-runner] OpenRouter proxy on ${await proxy.start()}`);
  else console.warn("[claude-runner] OPENROUTER_API_KEY missing: OpenCode and the audio script cannot reach OpenRouter");

  const enqueueNext = async (next: Omit<ClaudeJob, "jobId">) => {
    const jobId = randomUUID();
    await db.insert(jobs).values({ id: jobId, creationId: next.creationId, kind: "claude", step: next.step, input: next });
    await bus.add(QUEUES.claude, next.step, { ...next, jobId }, jobId);
  };

  const claudeCode = config.claudeCodeEnabled
    ? createClaudeCodeRunner({
        bin: config.claudeBin,
        skillsDir: config.skillsDir,
        workspaceDir: config.workspaceDir,
        env: agentEnv(
          { home: homedir(), tmp: tmpdir() },
          Object.fromEntries(CLAUDE_CODE_ENV.filter((key) => process.env[key]).map((key) => [key, process.env[key] as string])),
        ),
      })
    : null;

  // One `opencode serve` per client, under the client's uid, behind a password of its own. No more servers than
  // turns at a time: an idle one only saves a second of start-up, not worth its memory.
  const opencode = createOpencodePool({
    max: config.concurrency,
    idleMs: config.opencodeIdleMs,
    async start(uid) {
      const identity = agentIdentity(sandbox, uid, homedir());
      await prepareAgentHome(sandbox, identity);
      const password = randomBytes(24).toString("hex");
      const token = proxy?.grant();
      const { url, process: server } = await startOpencodeServer({
        bin: config.opencodeBin,
        cwd: config.workspaceDir,
        sandbox,
        identity,
        env: agentEnv(identity, {
          OPENCODE_SERVER_PASSWORD: password,
          AGENT_SKILLS_DIR: config.skillsDir,
          ...(token ? { OPENROUTER_BASE_URL: token.baseUrl, OPENROUTER_API_KEY: token.token } : {}),
        }),
      });
      console.log(`[claude-runner] opencode server of agent ${uid} listening on ${url}`);
      server.on("exit", () => token?.revoke());
      return {
        runner: createOpencodeRunner(createOpencodeHttpClient(url, password)),
        stop: () => server.kill("SIGTERM"),
        onExit: (listener) => server.on("exit", listener),
      };
    },
  });
  const runners: Record<AgentBackend, AgentRunner | null> = { "claude-code": claudeCode, opencode: opencode.runner };

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
        grantVideo: (slug, uid) => grantFolder(sandbox, join(config.workspaceDir, "videos", slug), uid),
        proxy,
      }),
    // A step interrupted by a restart fails instead of running again on its own: a Claude turn costs.
    {
      concurrency: config.concurrency,
      lockDuration: 5 * 60 * 1000,
      maxStalledCount: 0,
      onFailed: (jobId, error) => console.error(`[claude-runner] job ${jobId} failed:`, error.message),
    },
  );
  console.log(`[claude-runner] listening on ${QUEUES.claude} (enabled=${config.enabled})`);

  return {
    async close() {
      await worker.close();
      opencode.stopAll();
      await proxy?.close();
      await bus.close();
      await close();
    },
  };
}

if (require.main === module) {
  loadEnvironmentFiles();
  startClaudeRunner()
    .then((runner) => {
      const shutdown = () => runner.close().finally(() => process.exit(0));
      process.on("SIGTERM", shutdown);
      process.on("SIGINT", shutdown);
    })
    .catch((error: unknown) => {
      console.error("[claude-runner] failed to start", error);
      process.exit(1);
    });
}
