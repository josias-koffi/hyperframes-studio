import { join } from "node:path";
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
    frameAncestors: process.env.HF_STUDIO_FRAME_ANCESTORS?.trim() ?? "",
    overridesDir: join(__dirname, "..", "public"),
  });
  const server = createAdaptorServer({ fetch: gateway.app.fetch });
  server.listen(port, "0.0.0.0", () => console.log(`hf-studio gateway on :${port}`));

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
