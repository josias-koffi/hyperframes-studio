import { describe, expect, it } from "vitest";
import { engineRoute, rewritePreview } from "./engine-routes";

describe("engine routes", () => {
  it("lets the editor read the preview, files, thumbnails and waveforms", () => {
    expect(engineRoute("GET", "preview", "demo")).toEqual({ upstream: "/api/projects/demo/preview", writes: false });
    expect(engineRoute("GET", "preview/assets/a.mp4", "demo")?.upstream).toBe("/api/projects/demo/preview/assets/a.mp4");
    expect(engineRoute("GET", "files/compositions/x.html", "demo")?.writes).toBe(false);
    expect(engineRoute("GET", "thumbnail/index.html", "demo")).not.toBeNull();
    expect(engineRoute("GET", "peaks/assets/audio/bgm.mp3", "demo")).not.toBeNull();
    expect(engineRoute("GET", "runtime.js", "demo")).toEqual({ upstream: "/api/runtime.js", writes: false });
  });

  it("lets it write files whole, nothing else", () => {
    expect(engineRoute("PUT", "files/index.html", "demo")).toEqual({ upstream: "/api/projects/demo/files/index.html", writes: true });
    expect(engineRoute("POST", "file-mutations/patch-element/index.html", "demo")).toBeNull();
    expect(engineRoute("POST", "gsap-mutations/index.html", "demo")).toBeNull();
    expect(engineRoute("POST", "render", "demo")).toBeNull();
    expect(engineRoute("POST", "registry/install", "demo")).toBeNull();
    expect(engineRoute("DELETE", "files/index.html", "demo")).toBeNull();
    expect(engineRoute("GET", "files/../../etc/passwd", "demo")).toBeNull();
  });

  it("points a preview page at the API's engine route", () => {
    const html = '<base href="/api/projects/demo/preview/"><script data-hyperframes-preview-runtime="1" src="/api/runtime.js"></script>';
    expect(rewritePreview(html, "demo", "/api/creations/c1/engine")).toBe(
      '<base href="/api/creations/c1/engine/preview/"><script data-hyperframes-preview-runtime="1" src="/api/creations/c1/engine/runtime.js"></script>',
    );
  });
});
