import { describe, expect, it } from "vitest";
import type { Job, Render } from "./api";
import { projectState, stepJob, stepReached, studioBlockedReason } from "./project-state";

function job(overrides: Partial<Job>): Job {
  return {
    id: "j",
    projectId: "p",
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
    const state = projectState({ currentStep: "brief" }, []);
    expect(state.phase).toBe("idle");
    expect(states(state)).toEqual(["current", "todo", "todo", "todo", "todo"]);
  });

  it("marks earlier steps done and the checkpoint under review", () => {
    const state = projectState({ currentStep: "storyboard" }, [job({ step: "storyboard", status: "waiting_review" })]);
    expect(state.phase).toBe("review");
    expect(states(state)).toEqual(["done", "review", "todo", "todo", "todo"]);
  });

  it("reads the newest Claude job, not an older render", () => {
    const state = projectState({ currentStep: "media" }, [
      job({ step: "media", status: "failed" }),
      job({ kind: "render", step: null, status: "succeeded" }),
    ]);
    expect(state.phase).toBe("failed");
    expect(state.renderJob?.kind).toBe("render");
  });

  it("is done once the build is approved, and exports follow the renders", () => {
    const build = job({ step: "build", status: "succeeded" });
    expect(states(projectState({ currentStep: "build" }, [build]))).toEqual(["done", "done", "done", "done", "current"]);

    const render: Render = { id: "r", format: "mp4", storageKeys: [], urls: [], createdAt: "" };
    expect(projectState({ currentStep: "build" }, [build], [render]).steps.at(-1)?.state).toBe("done");

    const live = projectState({ currentStep: "build" }, [job({ kind: "render", step: null, status: "running" }), build]);
    expect(live.rendering).toBe(true);
    expect(live.steps.at(-1)?.state).toBe("running");
  });
});

describe("step helpers", () => {
  it("finds the newest job of a step", () => {
    const jobs = [job({ id: "b", step: "storyboard" }), job({ id: "a", step: "brief" }), job({ id: "old", step: "storyboard" })];
    expect(stepJob(jobs, "storyboard")?.id).toBe("b");
    expect(stepJob(jobs, "build")).toBeNull();
  });

  it("reaches earlier steps, and the current one only once it produced something", () => {
    expect(stepReached({ currentStep: "storyboard" }, { phase: "running" }, "brief")).toBe(true);
    expect(stepReached({ currentStep: "storyboard" }, { phase: "running" }, "storyboard")).toBe(false);
    expect(stepReached({ currentStep: "storyboard" }, { phase: "review" }, "storyboard")).toBe(true);
    expect(stepReached({ currentStep: "storyboard" }, { phase: "review" }, "media")).toBe(false);
  });

  it("opens the Studio once the build exists, never while Claude works", () => {
    expect(studioBlockedReason({ currentStep: "build" }, { phase: "done" })).toBeNull();
    expect(studioBlockedReason({ currentStep: "build" }, { phase: "review" })).toBeNull();
    expect(studioBlockedReason({ currentStep: "build" }, { phase: "running" })).toMatch(/Claude travaille/);
    expect(studioBlockedReason({ currentStep: "media" }, { phase: "review" })).toMatch(/build terminé/);
  });
});
