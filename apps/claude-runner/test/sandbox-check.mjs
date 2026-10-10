// Isolation check of the runner image (AGENT_SANDBOX=uid), with the image's own code: two clients A and B, and
// everything A's agent must not reach. Never calls OpenRouter.
//
//   docker run --rm -v "$PWD/apps/claude-runner/test:/check:ro" -e SECRET_CANARY=canary \
//     studio-claude-runner:sandbox node /check/sandbox-check.mjs
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire("/repo/apps/claude-runner/dist/");
const sandboxLib = require("/repo/apps/claude-runner/dist/sandbox.js");
const { createOpenrouterProxy } = require("/repo/apps/claude-runner/dist/openrouter-proxy.js");
const { startOpencodeServer } = require("/repo/apps/claude-runner/dist/agents/opencode.js");
const { agentEnv, agentIdentity, checkSandbox, grantFolder, lockWorkspace, prepareAgentHome, spawnAgent } = sandboxLib;

const workspace = "/workspace";
const A = 100101;
const B = 100102;
const sandbox = {
  mode: "uid",
  agentExec: "/usr/local/bin/agent-exec",
  agentsDir: "/agents",
  skillsDir: "/home/node/.claude/skills",
  browserDir: process.env.AGENT_BROWSER_DIR,
  serviceUid: process.getuid(),
};

let failures = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "✓" : "✗"} ${label}${ok || !detail ? "" : `\n    ${detail.slice(0, 400)}`}`);
};

/** Runs `sh -c script` as an agent and resolves with its exit code and output. */
function asAgent(identity, script, extraEnv = {}) {
  return new Promise((resolve) => {
    const child = spawnAgent(sandbox, identity, "sh", ["-c", script], { cwd: workspace, env: agentEnv(identity, extraEnv) });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("close", (code) => resolve({ code, output }));
  });
}

await checkSandbox(sandbox);
execFileSync("sh", ["-c", `cp -r /opt/workspace-skeleton/. ${workspace}/ && cd ${workspace} && git init -q && echo SECRET=canary > .env && mkdir -p .studio-history`]);
for (const slug of ["a", "b"]) execFileSync("sh", ["scripts/new-video.sh", slug], { cwd: workspace, stdio: "ignore" });
writeFileSync(join(workspace, "videos", "b", "BRIEF.md"), "brief confidentiel de B");
await lockWorkspace(sandbox, workspace, (slug) => ({ a: A, b: B })[slug]);
const idA = agentIdentity(sandbox, A, "/home/node");
const idB = agentIdentity(sandbox, B, "/home/node");
await prepareAgentHome(sandbox, idA);
await prepareAgentHome(sandbox, idB);
writeFileSync(join(idB.tmp, "secret.txt"), "tmp de B");

const proxy = createOpenrouterProxy({ upstream: "http://127.0.0.1:9/api/v1", apiKey: "sk-or-real" });
const proxyUrl = await proxy.start();
const tokenB = proxy.grant();
const password = randomBytes(12).toString("hex");
const serverB = await startOpencodeServer({
  bin: "opencode",
  cwd: workspace,
  sandbox,
  identity: idB,
  env: agentEnv(idB, { OPENCODE_SERVER_PASSWORD: password, OPENROUTER_BASE_URL: proxyUrl, OPENROUTER_API_KEY: tokenB.token }),
});

console.log(`\nClient A (uid ${A}) contre client B (uid ${B}) :`);
const denied = async (label, script) => {
  const { code, output } = await asAgent(idA, script);
  check(`refusé : ${label}`, code !== 0, output);
};
await denied("lire videos/b/BRIEF.md", "cat videos/b/BRIEF.md");
await denied("lister videos/", "ls videos/");
await denied("lire le .env du workspace", "cat .env");
await denied("lire l'historique git", "ls .git");
await denied("lire l'historique hf-studio", "ls .studio-history");
await denied("lire l'environnement du runner (/proc/1/environ)", "cat /proc/1/environ");
await denied("lire le home de B", `ls ${idB.home}`);
await denied("lire le tmp de B", `cat ${idB.tmp}/secret.txt`);
await denied("lire les sessions Claude Code de l'admin", "ls /home/node/.claude/projects");
await denied("devenir root ou un autre uid via sudo", `sudo -n /usr/local/bin/agent-exec ${B} id`);

const { output: envA } = await asAgent(idA, "env");
check("aucun secret du runner dans l'environnement de A", !envA.includes("canary") && !envA.includes("sk-or-real"), envA);
const { output: serverStatus } = await asAgent(idA, `curl -s -o /dev/null -w '%{http_code}' ${serverB.url}/session`);
check("le serveur OpenCode de B refuse A sans mot de passe (401)", serverStatus.trim() === "401", serverStatus);
const { output: proxyStatus } = await asAgent(idA, `curl -s -o /dev/null -w '%{http_code}' -X POST ${proxyUrl}/chat/completions`);
check("le proxy refuse un appel sans jeton (401)", proxyStatus.trim() === "401", proxyStatus);

console.log(`\nCe que A doit pouvoir faire :`);
const allowed = async (label, script, timeoutNote = "") => {
  const { code, output } = await asAgent(idA, script);
  check(`autorisé : ${label}${timeoutNote}`, code === 0, output);
};
await allowed("lire et écrire dans videos/a", "cat videos/a/index.html > /dev/null && echo ok > videos/a/NOTE.md && mkdir -p videos/a/assets/x");
check("le runner (node) relit ce que l'agent a écrit", readFileSync(join(workspace, "videos", "a", "NOTE.md"), "utf8") === "ok\n");
writeFileSync(join(workspace, "videos", "a", "EDIT.md"), "édition manuelle");
await allowed("modifier un fichier écrit ensuite par l'API (uid node)", "echo agent >> videos/a/EDIT.md");
await allowed("lire CLAUDE.md, scripts/ et les skills", "cat CLAUDE.md > /dev/null && ls scripts > /dev/null && ls ~/.claude/skills/hyperframes > /dev/null");
await allowed("écrire dans son tmp", 'echo x > "$TMPDIR/x"');
// A blank scaffold has no timeline, so its Layout check fails whoever runs it: what counts here is that every
// section ran (the browser started from the agent's home) without a permission error.
const { output: checkLog } = await asAgent(idA, "npm run check -- videos/a --no-browser-gpu 2>&1");
check(
  "autorisé : npm run check -- videos/a, navigateur compris",
  ["Lint", "Runtime", "Layout", "Motion", "Contrast"].every((section) => checkLog.includes(section)) && !/EACCES|EPERM|permission denied/i.test(checkLog),
  checkLog.slice(-1500),
);
mkdirSync(join(workspace, "videos", "c"), { recursive: true });
await grantFolder(sandbox, join(workspace, "videos", "c"), A);
await allowed("un dossier accordé plus tard", "ls videos/c");

serverB.process.kill("SIGTERM");
await proxy.close();
console.log(failures ? `\n${failures} vérification(s) en échec` : "\nIsolation vérifiée.");
process.exit(failures ? 1 : 0);
