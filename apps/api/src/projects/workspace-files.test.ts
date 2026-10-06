import { describe, expect, it } from "vitest";
import { resolveVideoFile } from "./workspace-files";

describe("resolveVideoFile", () => {
  it("resolves files inside the video folder", () => {
    expect(resolveVideoFile("/ws", "demo", "snapshots/a.png")).toBe("/ws/videos/demo/snapshots/a.png");
  });

  it("refuses paths that escape it", () => {
    expect(resolveVideoFile("/ws", "demo", "../other/index.html")).toBeNull();
    expect(resolveVideoFile("/ws", "demo", "/etc/passwd")).toBeNull();
    expect(resolveVideoFile("/ws", "demo", "../demo-evil/x")).toBeNull();
  });
});
