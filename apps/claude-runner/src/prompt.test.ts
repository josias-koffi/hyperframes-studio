import { join } from "node:path";
import { CREATION_KINDS, CREATION_TYPES, stepsFor } from "@studio/shared";
import { describe, expect, it } from "vitest";
import { buildPrompt, renderTemplate, type PromptContext } from "./prompt";

const PROMPTS = join(__dirname, "../../../prompts");

const base: Omit<PromptContext, "step"> = {
  type: "video",
  kind: "oneshot",
  slug: "demo",
  workflow: "product-launch-video",
  brief: { message: "m" },
  width: 1080,
  height: 1920,
  durationSeconds: 30,
  slideCount: null,
  campaign: "Lancement Q4\nTon direct.",
};

describe("renderTemplate", () => {
  it("fills placeholders and rejects unknown ones", () => {
    expect(renderTemplate("a {{ slug }} b", { slug: "x" })).toBe("a x b");
    expect(() => renderTemplate("{{nope}}", {})).toThrow("unknown prompt placeholder {{nope}}");
  });
});

describe("buildPrompt", () => {
  it("renders every step of every kind of création", async () => {
    for (const type of CREATION_TYPES) {
      for (const kind of CREATION_KINDS) {
        // With footage, a video goes through every step there is.
        for (const step of stepsFor({ type, kind, brief: { footage: "rush.mp4" } })) {
          const prompt = await buildPrompt(PROMPTS, { ...base, step, type, kind, slideCount: type === "carousel" ? 6 : null });
          expect(prompt).toContain("videos/demo");
        }
      }
    }
  });

  it("states the format of the création", async () => {
    const carousel = await buildPrompt(PROMPTS, { ...base, step: "build", type: "carousel", width: 1080, height: 1350, slideCount: 6 });
    expect(carousel).toContain('data-duration="6"');
    expect(carousel).toContain("1080×1350");
    const image = await buildPrompt(PROMPTS, { ...base, step: "build", type: "image" });
    expect(image).toContain("image fixe");
    const video = await buildPrompt(PROMPTS, { ...base, step: "storyboard" });
    expect(video).toContain("studio_audio:");
    expect(carousel).not.toContain("studio_audio:");
  });

  it("keeps the frame of the footage when the canvas is free", async () => {
    const prompt = await buildPrompt(PROMPTS, { ...base, step: "brief", width: null, height: null, durationSeconds: null });
    expect(prompt).toContain("footage");
    expect(prompt).not.toContain("×");
  });

  it("analyses the footage with the workspace script before the storyboard", async () => {
    const footage = { ...base, width: null, height: null, durationSeconds: null, brief: { footage: "rush.mp4" } };
    const prompt = await buildPrompt(PROMPTS, { ...footage, step: "footage" });
    expect(prompt).toContain("node scripts/footage.mjs videos/demo");
    expect(prompt).toContain("videos/demo/FOOTAGE.md");
    expect(await buildPrompt(PROMPTS, { ...footage, step: "storyboard" })).toContain("FOOTAGE.md");
  });

  it("tells an image or a carousel to use the backgrounds the user provided", async () => {
    const brief = { message: "m", backgrounds: ["plage.jpg"] };
    const image = await buildPrompt(PROMPTS, { ...base, step: "brief", type: "image", brief });
    expect(image).toContain("plage.jpg");
    expect(image).toContain("`backgrounds` (à recopier dans `BRIEF.md`)");
    expect(await buildPrompt(PROMPTS, { ...base, step: "build", type: "image", brief })).toContain("background-image");
    const carousel = await buildPrompt(PROMPTS, { ...base, step: "storyboard", type: "carousel", slideCount: 4, brief });
    expect(carousel).toContain("Un seul fond sert à toutes les slides");
  });

  it("keeps the build's checks in the foreground: a headless turn ends when Claude hands back", async () => {
    expect(await buildPrompt(PROMPTS, { ...base, step: "build" })).toContain("jamais en arrière-plan");
  });

  it("quotes the campaign in the brief", async () => {
    expect(await buildPrompt(PROMPTS, { ...base, step: "brief" })).toContain("> Lancement Q4\n> Ton direct.");
  });

  it("uses the feedback prompt when the user commented, with the format", async () => {
    const prompt = await buildPrompt(PROMPTS, { ...base, step: "storyboard", type: "carousel", slideCount: 4, feedback: "Plus court" });
    expect(prompt).toContain("Plus court");
    expect(prompt).toContain("carrousel");
  });

  it("adds the variable contract to a template's storyboard and build only", async () => {
    const build = (kind: "oneshot" | "template", step: "brief" | "build") => buildPrompt(PROMPTS, { ...base, step, kind });
    expect(await build("template", "build")).toContain("videos/demo/VARIABLES.json");
    expect(await build("oneshot", "build")).not.toContain("VARIABLES.json");
    expect(await build("template", "brief")).not.toContain("VARIABLES.json");
  });
});
