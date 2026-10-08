import { describe, expect, it } from "vitest";
import type { Job, Render } from "./api";
import { projectHref, projectState, stepJob, stepReached, studioBlockedReason } from "./project-state";

function job(overrides: Partial<Job>): Job {
  return {
    id: "j",
    projectId: "p",
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

const states = (s: ReturnType<typeof projectState>) => s.steps.map((step) => step.state);

describe("projectState", () => {
  it("starts idle on the brief", () => {
    const state = projectState({ currentStep: "brief", kind: "oneshot" }, []);
    expect(state.phase).toBe("idle");
    expect(states(state)).toEqual(["current", "todo", "todo", "todo", "todo"]);
  });

  it("marks earlier steps done and the checkpoint under review", () => {
    const state = projectState({ currentStep: "storyboard", kind: "oneshot" }, [job({ step: "storyboard", status: "waiting_review" })]);
    expect(state.phase).toBe("review");
    expect(states(state)).toEqual(["done", "review", "todo", "todo", "todo"]);
  });

  it("reads the newest Claude job, not an older render", () => {
    const state = projectState({ currentStep: "media", kind: "oneshot" }, [
      job({ step: "media", status: "failed" }),
      job({ kind: "render", step: null, status: "succeeded" }),
    ]);
    expect(state.phase).toBe("failed");
    expect(state.renderJob?.kind).toBe("render");
  });

  it("is done once the build is approved, and exports follow the renders", () => {
    const build = job({ step: "build", status: "succeeded" });
    expect(states(projectState({ currentStep: "build", kind: "oneshot" }, [build]))).toEqual(["done", "done", "done", "done", "current"]);

    const render: Render = { id: "r", iterationId: null, format: "mp4", variables: null, storageKeys: [], urls: [], createdAt: "" };
    expect(projectState({ currentStep: "build", kind: "oneshot" }, [build], [render]).steps.at(-1)?.state).toBe("done");

    const live = projectState({ currentStep: "build", kind: "oneshot" }, [job({ kind: "render", step: null, status: "running" }), build]);
    expect(live.rendering).toBe(true);
    expect(live.steps.at(-1)?.state).toBe("running");
  });

  it("adds the variables to a template and ends on its iterations", () => {
    const state = projectState({ currentStep: "variables", kind: "template" }, [job({ step: "variables", status: "waiting_review" })]);
    expect(state.steps.map((step) => step.step)).toEqual(["brief", "variables", "storyboard", "media", "build", "iterations"]);
    expect(states(state)).toEqual(["done", "review", "todo", "todo", "todo", "todo"]);

    const built = projectState({ currentStep: "build", kind: "template" }, [job({ step: "build", status: "succeeded" })], [], 2);
    expect(built.steps.at(-1)).toEqual({ step: "iterations", state: "done" });
  });
});

describe("projectHref", () => {
  it("files templates under their own section", () => {
    expect(projectHref({ id: "p", kind: "template" }, "iterations")).toBe("/templates/p/iterations");
    expect(projectHref({ id: "p", kind: "oneshot" })).toBe("/projects/p");
  });
});

describe("step helpers", () => {
  it("finds the newest job of a step", () => {
    const jobs = [job({ id: "b", step: "storyboard" }), job({ id: "a", step: "brief" }), job({ id: "old", step: "storyboard" })];
    expect(stepJob(jobs, "storyboard")?.id).toBe("b");
    expect(stepJob(jobs, "build")).toBeNull();
  });

  it("reaches earlier steps, and the current one only once it produced something", () => {
    expect(stepReached({ currentStep: "storyboard", kind: "oneshot" }, { phase: "running" }, "brief")).toBe(true);
    expect(stepReached({ currentStep: "storyboard", kind: "oneshot" }, { phase: "running" }, "storyboard")).toBe(false);
    expect(stepReached({ currentStep: "storyboard", kind: "oneshot" }, { phase: "review" }, "storyboard")).toBe(true);
    expect(stepReached({ currentStep: "storyboard", kind: "oneshot" }, { phase: "review" }, "media")).toBe(false);
    expect(stepReached({ currentStep: "storyboard", kind: "oneshot" }, { phase: "review" }, "variables")).toBe(false);
    expect(stepReached({ currentStep: "storyboard", kind: "template" }, { phase: "review" }, "variables")).toBe(true);
  });

  it("opens the Studio once the build exists, never while Claude works", () => {
    expect(studioBlockedReason({ currentStep: "build", kind: "oneshot" }, { phase: "done" })).toBeNull();
    expect(studioBlockedReason({ currentStep: "build", kind: "oneshot" }, { phase: "review" })).toBeNull();
    expect(studioBlockedReason({ currentStep: "build", kind: "oneshot" }, { phase: "running" })).toMatch(/Claude travaille/);
    expect(studioBlockedReason({ currentStep: "media", kind: "oneshot" }, { phase: "review" })).toMatch(/build terminé/);
  });
});
