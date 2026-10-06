import { describe, expect, it } from "vitest";
import { sanitizeFilename, storageKeys } from "./keys";

describe("sanitizeFilename", () => {
  it("drops directories and unsafe characters", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename("Logo blanc (v2).SVG")).toBe("Logo-blanc-v2-.SVG");
    expect(sanitizeFilename("Écran d'accueil.png")).toBe("Ecran-d-accueil.png");
  });

  it("never returns an empty or hidden name", () => {
    expect(sanitizeFilename("")).toBe("file");
    expect(sanitizeFilename(".env")).toBe("env");
  });
});

describe("storageKeys", () => {
  it("builds keys under their prefix", () => {
    expect(storageKeys.asset("a1", "logo.svg")).toBe("assets/a1/logo.svg");
    expect(storageKeys.render("p1", "r1", "out.mp4")).toBe("renders/p1/r1/out.mp4");
  });
});
