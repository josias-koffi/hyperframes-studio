import { describe, expect, it } from "vitest";
import { formatBytes, kindFromFile } from "./assets";

describe("assets helpers", () => {
  it("guesses the kind from the MIME type and name", () => {
    expect(kindFromFile({ type: "video/mp4", name: "rush.mp4" })).toBe("video");
    expect(kindFromFile({ type: "image/svg+xml", name: "logo-dark.svg" })).toBe("logo");
    expect(kindFromFile({ type: "", name: "Inter.woff2" })).toBe("font");
    expect(kindFromFile({ type: "application/zip", name: "x.zip" })).toBe("other");
  });

  it("formats sizes", () => {
    expect(formatBytes(512)).toBe("512 o");
    expect(formatBytes(1536)).toBe("1.5 Ko");
    expect(formatBytes(25 * 1024 * 1024)).toBe("25 Mo");
  });
});
