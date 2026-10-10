import { createAdaptorServer } from "@hono/node-server";
import { loadEnvironmentFiles, resolveWorkspaceDir } from "@studio/shared";
import { createGateway } from "./gateway";
import { loadCreateStudio } from "./studio-cli";

loadEnvironmentFiles();

async function main() {
  const port = Number.parseInt(process.env.PORT_HF_STUDIO ?? process.env.HF_STUDIO_PORT ?? "", 10) || 3344;
  const gateway = createGateway({
    workspaceDir: resolveWorkspaceDir(),
    createStudio: await loadCreateStudio(),
    token: process.env.HF_STUDIO_TOKEN?.trim() ?? "",
    internalHost: `127.0.0.1:${port}`,
  });
  const server = createAdaptorServer({ fetch: gateway.app.fetch });
  server.listen(port, process.env.HOST?.trim() || "127.0.0.1", () => console.log(`hf-studio engine on :${port}`));

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      server.close();
      gateway.close().finally(() => process.exit(0));
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
