import { describe, expect, it } from "vitest";
import { aspectOf, carouselTimes, slugify } from "./creations";
import { allowedFormats, claudeJobSchema, deliverableFor, nextStep, renderJobSchema, stepsFor } from "./jobs";

describe("stepsFor", () => {
  it("only proposes variables for a template", () => {
    expect(stepsFor({ type: "video", kind: "template" })).toEqual(["brief", "variables", "storyboard", "media", "build"]);
    expect(stepsFor({ type: "video", kind: "oneshot" })).toEqual(["brief", "storyboard", "media", "build"]);
  });

  it("plans the slides of a carousel but gives it no soundtrack", () => {
    expect(stepsFor({ type: "carousel", kind: "oneshot" })).toEqual(["brief", "storyboard", "build"]);
    expect(stepsFor({ type: "carousel", kind: "template" })).toEqual(["brief", "variables", "storyboard", "build"]);
  });

  it("builds an image right after its brief", () => {
    expect(stepsFor({ type: "image", kind: "oneshot" })).toEqual(["brief", "build"]);
    expect(stepsFor({ type: "image", kind: "template" })).toEqual(["brief", "variables", "build"]);
  });
});

describe("nextStep", () => {
  it("goes from the brief to the variables of a template", () => {
    expect(nextStep("brief", { type: "video", kind: "template" })).toBe("variables");
    expect(nextStep("variables", { type: "video", kind: "template" })).toBe("storyboard");
    expect(nextStep("variables", { type: "image", kind: "template" })).toBe("build");
  });

  it("skips what a création does not need", () => {
    expect(nextStep("brief", { type: "video", kind: "oneshot" })).toBe("storyboard");
    expect(nextStep("storyboard", { type: "carousel", kind: "oneshot" })).toBe("build");
    expect(nextStep("brief", { type: "image", kind: "oneshot" })).toBe("build");
  });

  it("ends after the build", () => {
    expect(nextStep("build", { type: "video", kind: "template" })).toBeNull();
  });
});

describe("deliverableFor", () => {
  it("renders a video to mp4", () => {
    expect(deliverableFor({ type: "video" })).toEqual({ format: "mp4" });
  });

  it("captures an image once, in the middle of its second", () => {
    expect(deliverableFor({ type: "image" })).toEqual({ format: "png", at: [0.5] });
  });

  it("captures one still per slide of a carousel", () => {
    expect(deliverableFor({ type: "carousel", slideCount: 3 })).toEqual({ format: "pdf", at: [0.5, 1.5, 2.5] });
    expect(deliverableFor({ type: "carousel", slideCount: null }).at).toHaveLength(5);
  });
});

describe("allowedFormats", () => {
  it("keeps stills to stills", () => {
    expect(allowedFormats("image")).toEqual(["png"]);
    expect(allowedFormats("carousel")).toEqual(["pdf", "png"]);
    expect(allowedFormats("video")).toContain("mp4");
  });
});

describe("creation helpers", () => {
  it("spreads carousel captures one second apart", () => {
    expect(carouselTimes(2)).toEqual([0.5, 1.5]);
  });

  it("recognises the canvas presets", () => {
    expect(aspectOf(1080, 1350)).toBe("4:5");
    expect(aspectOf(1000, 1000)).toBeNull();
    expect(aspectOf(null, null)).toBeNull();
  });

  it("turns a name into a folder name", () => {
    expect(slugify("Lancement Été 2026 !")).toBe("lancement-ete-2026");
  });
});

describe("job schemas", () => {
  const ids = { jobId: "8f9a4c2e-1b3d-4e5f-9a7b-6c8d0e1f2a3b", projectId: "1d2e3f4a-5b6c-4d7e-8f9a-0b1c2d3e4f5a" };

  it("reads a job enqueued before créations existed", () => {
    expect(claudeJobSchema.parse({ ...ids, slug: "demo", step: "brief" }).creationId).toBe(ids.projectId);
    expect(renderJobSchema.parse({ ...ids, slug: "demo" })).toMatchObject({ creationId: ids.projectId, format: "mp4" });
  });
});
