import { GENERATION_STEPS, type GenerationStep } from "@studio/shared/browser";
import type { Job, Project, Render } from "./api";

/** Where a project stands, from the user's point of view: what they should do next. */
export type ProjectPhase =
  /** No Claude job yet, or the last one stopped without a follow-up: the user launches the current step. */
  | "idle"
  | "running"
  | "review"
  | "failed"
  /** The build checkpoint was approved: only exports remain. */
  | "done";

export type StepState = "done" | "current" | "running" | "review" | "failed" | "todo";

export type PipelineStep = GenerationStep | "export";

export type ProjectState = {
  phase: ProjectPhase;
  /** Newest Claude job, which drives the workbench. */
  claudeJob: Job | null;
  /** Newest render job. */
  renderJob: Job | null;
  rendering: boolean;
  steps: { step: PipelineStep; state: StepState }[];
};

const LIVE: Job["status"][] = ["queued", "running"];

/** `jobs` come newest first, as `GET /projects/:id/jobs` returns them. */
export function projectState(project: Pick<Project, "currentStep">, jobs: Job[], renders: Render[] = []): ProjectState {
  const claudeJob = jobs.find((job) => job.kind === "claude") ?? null;
  const renderJob = jobs.find((job) => job.kind === "render") ?? null;
  const rendering = renderJob !== null && LIVE.includes(renderJob.status);

  let phase: ProjectPhase = "idle";
  if (claudeJob) {
    if (LIVE.includes(claudeJob.status)) phase = "running";
    else if (claudeJob.status === "waiting_review") phase = "review";
    else if (claudeJob.status === "failed") phase = "failed";
    else if (claudeJob.step === "build" && claudeJob.status === "succeeded") phase = "done";
  }

  const current = GENERATION_STEPS.indexOf(project.currentStep);
  const atCurrent: Record<ProjectPhase, StepState> = {
    idle: "current",
    running: "running",
    review: "review",
    failed: "failed",
    done: "done",
  };
  const steps: ProjectState["steps"] = GENERATION_STEPS.map((step, index) => ({
    step,
    state: index < current ? "done" : index === current ? atCurrent[phase] : "todo",
  }));
  steps.push({
    step: "export",
    state: rendering ? "running" : renders.length > 0 ? "done" : phase === "done" ? "current" : "todo",
  });

  return { phase, claudeJob, renderJob, rendering, steps };
}

/** Newest Claude job that ran this step (its log and its review belong to the step page). */
export function stepJob(jobs: Job[], step: GenerationStep): Job | null {
  return jobs.find((job) => job.kind === "claude" && job.step === step) ?? null;
}

/** A step's files exist once it finished at least once: an earlier step, or the current one under review or done. */
export function stepReached(project: Pick<Project, "currentStep">, state: Pick<ProjectState, "phase">, step: GenerationStep) {
  const index = GENERATION_STEPS.indexOf(step);
  const current = GENERATION_STEPS.indexOf(project.currentStep);
  return index < current || (index === current && (state.phase === "review" || state.phase === "done"));
}
