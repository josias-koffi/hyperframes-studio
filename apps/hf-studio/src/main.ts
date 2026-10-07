import { loadEnvironmentFiles, resolveWorkspaceDir } from "@studio/shared";
import { createGateway } from "./gateway";

loadEnvironmentFiles();

const port = Number.parseInt(process.env.PORT_HF_STUDIO ?? process.env.HF_STUDIO_PORT ?? "", 10) || 3344;
const gateway = createGateway({
  workspaceDir: resolveWorkspaceDir(),
  hyperframes: (process.env.HYPERFRAMES_BIN?.trim() || "hyperframes").split(/\s+/),
  previewPort: Number.parseInt(process.env.HF_PREVIEW_PORT ?? "", 10) || 3402,
  token: process.env.HF_STUDIO_TOKEN?.trim() ?? "",
  readyTimeoutMs: 120_000,
  frameAncestors: process.env.HF_STUDIO_FRAME_ANCESTORS?.trim() ?? "",
});

gateway.server.listen(port, "0.0.0.0", () => console.log(`hf-studio gateway on :${port}`));

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    gateway.close().finally(() => process.exit(0));
  });
}
