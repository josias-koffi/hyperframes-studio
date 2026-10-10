// Installers of the desktop app: `pnpm desktop:dist` at the root, on the system they are for. scripts/stage.mjs lays
// out build/ first; the window's process (build/app) is the only part electron-builder packs itself.
import { cp, rm } from "node:fs/promises";
import { join } from "node:path";

/** What the app starts, copied as is next to app.asar: electron-builder's filters would drop node_modules and tests. */
const RESOURCES = ["runtime", "web", "workspace", "prompts", "node", "ffmpeg"];

/** @type {import("electron-builder").Configuration} */
export default {
  appId: "app.framesmith.studio",
  productName: "Framesmith",
  copyright: "Framesmith",
  // resources/icon.png (1024 px, from apps/web/app/icon.svg): electron-builder makes every size and format from it.
  directories: { app: "build/app", output: "release", buildResources: "resources" },
  // The main process imports nothing but Electron and Node. electron-builder still copies the dependencies of
  // apps/desktop next to it (an app without any takes the ones it finds above): no asar, and afterPack drops them.
  asar: false,
  npmRebuild: false,
  async afterPack({ appOutDir, packager }) {
    const resources =
      packager.platform.name === "mac" ? join(appOutDir, `${packager.appInfo.productFilename}.app`, "Contents", "Resources") : join(appOutDir, "resources");
    await rm(join(resources, "app", "node_modules"), { recursive: true, force: true });
    for (const name of RESOURCES) {
      await cp(join(import.meta.dirname, "build", name), join(resources, name), { recursive: true, verbatimSymlinks: true });
    }
  },
  linux: {
    target: ["AppImage", "deb"],
    category: "AudioVideo",
    maintainer: "Framesmith",
    synopsis: "Studio HyperFrames sur le poste",
  },
  // Electron's own dependencies, and git: the workspace keeps a commit per step.
  deb: { depends: ["libgtk-3-0", "libnotify4", "libnss3", "libxss1", "libxtst6", "xdg-utils", "libatspi2.0-0", "libuuid1", "libsecret-1-0", "git"] },
  mac: { target: "dmg", category: "public.app-category.video" },
};
