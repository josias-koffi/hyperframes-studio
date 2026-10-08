import { describe, expect, it } from "vitest";
import { createCreationSchema, creationValues, uniqueSlug } from "./creations.schemas";

const PROJECT = "1d2e3f4a-5b6c-4d7e-8f9a-0b1c2d3e4f5a";

describe("createCreationSchema", () => {
  it("accepts a video made from footage without a format", () => {
    expect(createCreationSchema.safeParse({ name: "Interview", brief: { footage: "a.mp4" } }).success).toBe(true);
  });

  it("asks a carousel or an image for a format it supports", () => {
    expect(createCreationSchema.safeParse({ name: "Slides", type: "carousel" }).success).toBe(false);
    expect(createCreationSchema.safeParse({ name: "Slides", type: "carousel", aspect: "16:9" }).success).toBe(false);
    expect(createCreationSchema.safeParse({ name: "Slides", type: "carousel", aspect: "4:5" }).success).toBe(true);
  });
});

describe("creationValues", () => {
  it("keeps only the settings of the type", () => {
    const carousel = creationValues(PROJECT, "slides", createCreationSchema.parse({
      name: "Slides", type: "carousel", aspect: "4:5", durationSeconds: 30, workflow: "music-to-video",
    }));
    expect(carousel).toMatchObject({ width: 1080, height: 1350, slideCount: 5, durationSeconds: null, workflow: "general-video" });

    const video = creationValues(PROJECT, "promo", createCreationSchema.parse({ name: "Promo", aspect: "9:16", durationSeconds: 30, slideCount: 4 }));
    expect(video).toMatchObject({ width: 1080, height: 1920, durationSeconds: 30, slideCount: null });
  });
});

describe("uniqueSlug", () => {
  it("suffixes a taken folder name", () => {
    expect(uniqueSlug("promo", new Set())).toBe("promo");
    expect(uniqueSlug("promo", new Set(["promo", "promo-2"]))).toBe("promo-3");
    expect(uniqueSlug("", new Set())).toBe("creation");
  });
});
