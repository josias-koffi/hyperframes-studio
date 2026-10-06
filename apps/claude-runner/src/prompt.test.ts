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
  it.each(["brief", "storyboard", "media", "build"] as const)("renders prompts/%s.md", async (step) => {
    const prompt = await buildPrompt(PROMPTS, { step, slug: "demo", workflow: "product-launch-video", brief: { message: "m" } });
    expect(prompt).toContain("videos/demo");
  });

  it("uses the feedback prompt when the user commented", async () => {
    const prompt = await buildPrompt(PROMPTS, { step: "storyboard", slug: "demo", workflow: "w", brief: {}, feedback: "Plus court" });
    expect(prompt).toContain("Plus court");
  });
});
