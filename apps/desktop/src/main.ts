import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync, type WriteStream } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { app, BrowserWindow, dialog, shell } from "electron";

/** The prototype runs from the monorepo: the services' builds, the workspace skeleton, the prompts, `.env`. */
const REPO = resolve(__dirname, "../../..");
/** Every service listens on the loopback only: nothing on the network reaches this machine's studio. */
const HOST = "127.0.0.1";

type Service = { name: string; child: ChildProcess };
const services: Service[] = [];
let log: WriteStream | null = null;

// Its data folder: ~/.config/Framesmith, ~/Library/Application Support/Framesmith, %APPDATA%\Framesmith.
app.setName("Framesmith");
if (!app.requestSingleInstanceLock()) app.quit();
else void app.whenReady().then(start);

async function start() {
  const window = new BrowserWindow({ width: 1440, height: 900, title: "Framesmith", backgroundColor: "#0b0b0c" });
  void window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(SPLASH)}`);
  app.on("second-instance", () => window.focus());

  try {
    const urls = await startServices();
    // Pages of the studio stay in the app; any other link opens in the browser.
    window.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith(urls.web) || url.startsWith(urls.api)) return { action: "allow" };
      void shell.openExternal(url);
      return { action: "deny" };
    });
    await window.loadURL(urls.signIn);
  } catch (error) {
    dialog.showErrorBox("Framesmith n'a pas pu démarrer", `${error instanceof Error ? error.message : String(error)}\n\nJournal : ${logPath()}`);
    app.quit();
  }
}

async function startServices() {
  const data = app.getPath("userData");
  mkdirSync(data, { recursive: true });
  log = createWriteStream(logPath(), { flags: "a" });
  if (existsSync(join(REPO, ".env"))) process.loadEnvFile(join(REPO, ".env"));

  const [webPort, apiPort, enginePort] = await Promise.all([freePort(), freePort(), freePort()]);
  const web = `http://${HOST}:${webPort}`;
  const api = `http://${HOST}:${apiPort}`;
  const loginToken = randomBytes(24).toString("hex");
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    // Electron's binary runs the services as plain Node.
    ELECTRON_RUN_AS_NODE: "1",
    NODE_ENV: "production",
    HOST,
    PORT: String(apiPort),
    API_URL: api,
    WEB_URL: web,
    DATABASE_DIR: join(data, "database"),
    STORAGE_DIR: join(data, "storage"),
    STORAGE_PUBLIC_URL: api,
    WORKSPACE_DIR: join(data, "workspace"),
    WORKSPACE_SKELETON_DIR: join(REPO, "workspace"),
    PROMPTS_DIR: join(REPO, "prompts"),
    // The OpenCode of this platform, installed with the app (`opencode-ai` links it at install).
    OPENCODE_BIN: join(dirname(require.resolve("opencode-ai/package.json")), "bin", "opencode.exe"),
    AGENT_TMP_DIR: join(data, "agent-tmp"),
    HF_STUDIO_URL: `http://${HOST}:${enginePort}`,
    PORT_HF_STUDIO: String(enginePort),
    HF_STUDIO_TOKEN: randomBytes(24).toString("hex"),
    AUTH_SESSION_SECRET: sessionSecret(data),
    DESKTOP_LOGIN_TOKEN: loginToken,
  };

  const webDir = join(REPO, "apps/web");
  if (!existsSync(join(webDir, ".next/BUILD_ID"))) throw new Error("Le front n'est pas construit : lance `pnpm build` à la racine du dépôt.");

  // The engine and the web front first: the core's workers may call the engine as soon as they run.
  const engine = launch("engine", join(REPO, "apps/hf-studio/dist/main.js"), [], env, join(REPO, "apps/hf-studio"));
  const front = launch("web", require.resolve("next/dist/bin/next", { paths: [webDir] }), ["start", "-p", String(webPort), "-H", HOST], env, webDir);
  const core = launch("core", join(__dirname, "core.js"), [], env, REPO);
  await Promise.all([
    waitFor(`${api}/ready`, core),
    waitFor(`${web}/login`, front),
    waitFor(`http://${HOST}:${enginePort}/`, engine),
  ]);
  return { web, api, signIn: `${web}/api/auth/desktop?token=${loginToken}` };
}

function launch(name: string, script: string, args: string[], env: NodeJS.ProcessEnv, cwd: string): ChildProcess {
  const child = spawn(process.execPath, [script, ...args], { env, cwd, stdio: ["ignore", "pipe", "pipe"] });
  const write = (chunk: Buffer) => {
    for (const line of chunk.toString().split("\n").filter(Boolean)) {
      const text = `[${name}] ${line}\n`;
      process.stdout.write(text);
      log?.write(text);
    }
  };
  child.stdout?.on("data", write);
  child.stderr?.on("data", write);
  child.on("exit", (code, signal) => write(Buffer.from(`exited (${signal ?? code})`)));
  services.push({ name, child });
  return child;
}

/** Resolves once `url` answers (any status below 500), fails if the service exits first or takes over two minutes. */
async function waitFor(url: string, child: ChildProcess) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Un service s'est arrêté au démarrage (${url}).`);
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Pas de réponse de ${url} après deux minutes.`);
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, HOST, () => {
      const address = server.address();
      server.close(() => (typeof address === "object" && address ? resolve(address.port) : reject(new Error("no port"))));
    });
  });
}

/** Kept across starts, so the window's session cookie stays valid from one launch to the next. */
function sessionSecret(data: string): string {
  const path = join(data, "session-secret");
  if (existsSync(path)) return readFileSync(path, "utf8").trim();
  const secret = randomBytes(48).toString("base64url");
  writeFileSync(path, secret, { mode: 0o600 });
  return secret;
}

function logPath() {
  return join(app.getPath("userData"), "services.log");
}

let stopped = false;
app.on("before-quit", (event) => {
  if (stopped) return;
  event.preventDefault();
  void stopServices().finally(() => {
    stopped = true;
    app.quit();
  });
});
app.on("window-all-closed", () => app.quit());

/** SIGTERM lets the core stop its workers and close the database; a service still up after five seconds is killed. */
async function stopServices() {
  await Promise.all(
    services.map(
      ({ child }) =>
        new Promise<void>((resolve) => {
          if (child.exitCode !== null || child.signalCode !== null) return resolve();
          const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
          child.once("exit", () => {
            clearTimeout(timer);
            resolve();
          });
          child.kill("SIGTERM");
        }),
    ),
  );
}

const SPLASH = `<!doctype html><html><body style="margin:0;height:100vh;display:grid;place-items:center;background:#0b0b0c;color:#e7e7ea;font:15px system-ui">
<div style="text-align:center"><div style="font-size:22px;font-weight:600;margin-bottom:8px">Framesmith</div><div style="opacity:.6">Démarrage du studio…</div></div></body></html>`;
