import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildPrompt, renderTemplate } from "./prompt";

const PROMPTS = join(__dirname, "../../../prompts");

describe("renderTemplate", () => {
  it("fills placeholders and rejects unknown ones", () => {
    expect(renderTemplate("a {{ slug }} b", { slug: "x" })).toBe("a x b");
    expect(() => renderTemplate("{{nope}}", {})).toThrow("unknown prompt placeholder {{nope}}");
  });
});

describe("buildPrompt", () => {
  it.each(["brief", "variables", "storyboard", "media", "build"] as const)("renders prompts/%s.md", async (step) => {
    for (const kind of ["oneshot", "template"] as const) {
      const prompt = await buildPrompt(PROMPTS, { step, kind, slug: "demo", workflow: "product-launch-video", brief: { message: "m" } });
      expect(prompt).toContain("videos/demo");
    }
  });

  it("uses the feedback prompt when the user commented", async () => {
    const prompt = await buildPrompt(PROMPTS, { step: "storyboard", kind: "oneshot", slug: "demo", workflow: "w", brief: {}, feedback: "Plus court" });
    expect(prompt).toContain("Plus court");
  });

  it("adds the variable contract to a template's storyboard and build only", async () => {
    const build = (kind: "oneshot" | "template", step: "brief" | "build") =>
      buildPrompt(PROMPTS, { step, kind, slug: "demo", workflow: "w", brief: {} });
    expect(await build("template", "build")).toContain("videos/demo/VARIABLES.json");
    expect(await build("oneshot", "build")).not.toContain("VARIABLES.json");
    expect(await build("template", "brief")).not.toContain("VARIABLES.json");
  });
});
