import { describe, expect, it } from "vitest";
import { nextStep, stepsFor } from "./jobs";

describe("stepsFor", () => {
  it("only proposes variables for a template", () => {
    expect(stepsFor("template")).toEqual(["brief", "variables", "storyboard", "media", "build"]);
    expect(stepsFor("oneshot")).toEqual(["brief", "storyboard", "media", "build"]);
  });
});

describe("nextStep", () => {
  it("goes from the brief to the variables of a template", () => {
    expect(nextStep("brief", "template")).toBe("variables");
    expect(nextStep("variables", "template")).toBe("storyboard");
  });

  it("skips the variables of a one-shot video", () => {
    expect(nextStep("brief", "oneshot")).toBe("storyboard");
  });

  it("ends after the build", () => {
    expect(nextStep("build", "template")).toBeNull();
  });
});
