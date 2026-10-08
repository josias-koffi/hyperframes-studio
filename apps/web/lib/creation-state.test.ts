import { describe, expect, it } from "vitest";
import type { Job } from "./api";
import { creationHref, creationState, renderFiles, stepJob, stepReached, studioBlockedReason } from "./creation-state";

function job(overrides: Partial<Job>): Job {
  return {
    id: "j",
    creationId: "c",
    iterationId: null,
    kind: "claude",
    step: "brief",
    status: "running",
    resultText: null,
    createdAt: "2026-10-07T10:00:00Z",
    finishedAt: null,
    ...overrides,
  };
}

const states = (s: ReturnType<typeof creationState>) => s.steps.map((step) => step.state);

describe("creationState", () => {
  it("starts idle on the brief", () => {
    const state = creationState({ currentStep: "brief", type: "video", kind: "oneshot" }, []);
    expect(state.phase).toBe("idle");
    expect(states(state)).toEqual(["current", "todo", "todo", "todo", "todo"]);
  });

  it("marks earlier steps done and the checkpoint under review", () => {
    const state = creationState({ currentStep: "storyboard", type: "video", kind: "oneshot" }, [job({ step: "storyboard", status: "waiting_review" })]);
    expect(state.phase).toBe("review");
    expect(states(state)).toEqual(["done", "review", "todo", "todo", "todo"]);
  });

  it("reads the newest Claude job, not an older render", () => {
    const state = creationState({ currentStep: "media", type: "video", kind: "oneshot" }, [
      job({ step: "media", status: "failed" }),
      job({ kind: "render", step: null, status: "succeeded" }),
    ]);
    expect(state.phase).toBe("failed");
    expect(state.renderJob?.kind).toBe("render");
  });

  it("is done once the build is approved, and exports follow the renders", () => {
    const build = job({ step: "build", status: "succeeded" });
    expect(states(creationState({ currentStep: "build", type: "video", kind: "oneshot" }, [build]))).toEqual(["done", "done", "done", "done", "current"]);

    expect(creationState({ currentStep: "build", type: "video", kind: "oneshot" }, [build], 1).steps.at(-1)?.state).toBe("done");

    const live = creationState({ currentStep: "build", type: "video", kind: "oneshot" }, [job({ kind: "render", step: null, status: "running" }), build]);
    expect(live.rendering).toBe(true);
    expect(live.steps.at(-1)?.state).toBe("running");
  });

  it("adds the variables to a template and ends on its iterations", () => {
    const state = creationState({ currentStep: "variables", type: "video", kind: "template" }, [job({ step: "variables", status: "waiting_review" })]);
    expect(state.steps.map((step) => step.step)).toEqual(["brief", "variables", "storyboard", "media", "build", "iterations"]);
    expect(states(state)).toEqual(["done", "review", "todo", "todo", "todo", "todo"]);

    const built = creationState({ currentStep: "build", type: "video", kind: "template" }, [job({ step: "build", status: "succeeded" })], 0, 2);
    expect(built.steps.at(-1)).toEqual({ step: "iterations", state: "done" });
  });

  it("reviews the footage analysis of a video made from an uploaded clip", () => {
    const creation = { currentStep: "footage", type: "video", kind: "oneshot", brief: { footage: "rush.mp4" } } as const;
    const state = creationState(creation, [job({ step: "footage", status: "waiting_review" })]);
    expect(state.steps.map((step) => step.step)).toEqual(["brief", "footage", "storyboard", "media", "build", "export"]);
    expect(states(state)).toEqual(["done", "review", "todo", "todo", "todo", "todo"]);
  });
});

describe("stills", () => {
  it("plans a carousel's slides and composes an image straight from its brief", () => {
    const carousel = creationState({ currentStep: "storyboard", type: "carousel", kind: "oneshot" }, [job({ step: "storyboard", status: "waiting_review" })]);
    expect(carousel.steps.map((step) => step.step)).toEqual(["brief", "storyboard", "build", "export"]);
    expect(states(carousel)).toEqual(["done", "review", "todo", "todo"]);

    const image = creationState({ currentStep: "build", type: "image", kind: "template" }, [job({ step: "build", status: "succeeded" })]);
    expect(image.steps.map((step) => step.step)).toEqual(["brief", "variables", "build", "iterations"]);
    expect(image.phase).toBe("done");
  });

  it("splits a carousel render into slides and its PDF", () => {
    const files = renderFiles({
      storageKeys: ["renders/c/r/slide-01.png", "renders/c/r/slide-02.png", "renders/c/r/demo.pdf"],
      urls: ["u1", "u2", "u3"],
    });
    expect(files.images.map((image) => image.url)).toEqual(["u1", "u2"]);
    expect(files.pdf?.url).toBe("u3");
    expect(files.video).toBeNull();
  });
});

describe("creationHref", () => {
  it("files a création under its project", () => {
    expect(creationHref({ id: "c", projectId: "p" }, "iterations")).toBe("/projects/p/creations/c/iterations");
    expect(creationHref({ id: "c", projectId: "p" })).toBe("/projects/p/creations/c");
  });
});

describe("step helpers", () => {
  it("finds the newest job of a step", () => {
    const jobs = [job({ id: "b", step: "storyboard" }), job({ id: "a", step: "brief" }), job({ id: "old", step: "storyboard" })];
    expect(stepJob(jobs, "storyboard")?.id).toBe("b");
    expect(stepJob(jobs, "build")).toBeNull();
  });

  it("reaches earlier steps, and the current one only once it produced something", () => {
    expect(stepReached({ currentStep: "storyboard", type: "video", kind: "oneshot" }, { phase: "running" }, "brief")).toBe(true);
    expect(stepReached({ currentStep: "storyboard", type: "video", kind: "oneshot" }, { phase: "running" }, "storyboard")).toBe(false);
    expect(stepReached({ currentStep: "storyboard", type: "video", kind: "oneshot" }, { phase: "review" }, "storyboard")).toBe(true);
    expect(stepReached({ currentStep: "storyboard", type: "video", kind: "oneshot" }, { phase: "review" }, "media")).toBe(false);
    expect(stepReached({ currentStep: "storyboard", type: "video", kind: "oneshot" }, { phase: "review" }, "variables")).toBe(false);
    expect(stepReached({ currentStep: "storyboard", type: "video", kind: "template" }, { phase: "review" }, "variables")).toBe(true);
  });

  it("opens the Studio once the build exists, never while Claude works", () => {
    expect(studioBlockedReason({ currentStep: "build", type: "video", kind: "oneshot" }, { phase: "done" })).toBeNull();
    expect(studioBlockedReason({ currentStep: "build", type: "video", kind: "oneshot" }, { phase: "review" })).toBeNull();
    expect(studioBlockedReason({ currentStep: "build", type: "video", kind: "oneshot" }, { phase: "running" })).toMatch(/Claude travaille/);
    expect(studioBlockedReason({ currentStep: "media", type: "video", kind: "oneshot" }, { phase: "review" })).toMatch(/build terminé/);
  });
});
