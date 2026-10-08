import { stepsFor, type GenerationStep, type ProjectKind } from "@studio/shared/browser";
import type { Job, Project, Render } from "./api";

/** Where a project stands, from the user's point of view: what they should do next. */
export type ProjectPhase =
  /** No Claude job yet, or the last one stopped without a follow-up: the user launches the current step. */
  | "idle"
  | "running"
  | "review"
  | "failed"
  /** The build checkpoint was approved: only exports (or iterations of a template) remain. */
  | "done";

export type StepState = "done" | "current" | "running" | "review" | "failed" | "todo";

/** After the build, a one-shot video is exported; a template is used as iterations. */
export type PipelineStep = GenerationStep | "export" | "iterations";

/** URL segment of each step page. Lives here, not in a "use client" module, so server pages can read it. */
export const STEP_SEGMENTS: Record<PipelineStep, string> = {
  brief: "brief",
  variables: "variables",
  storyboard: "storyboard",
  media: "media",
  build: "build",
  export: "exports",
  iterations: "iterations",
};

/** Where a project lives: templates have their own section. */
export function projectHref(project: { id: string; kind: ProjectKind }, segment?: string): string {
  const base = `/${project.kind === "template" ? "templates" : "projects"}/${project.id}`;
  return segment ? `${base}/${segment}` : base;
}

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

type StateProject = Pick<Project, "currentStep" | "kind">;

/**
 * `jobs` come newest first, as `GET /projects/:id/jobs` returns them. `outputs` counts what the last stop holds:
 * the renders of a one-shot video, the iterations of a template.
 */
export function projectState(project: StateProject, jobs: Job[], renders: Render[] = [], iterationCount = 0): ProjectState {
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

  const pipeline = stepsFor(project.kind);
  const current = pipeline.indexOf(project.currentStep);
  const atCurrent: Record<ProjectPhase, StepState> = {
    idle: "current",
    running: "running",
    review: "review",
    failed: "failed",
    done: "done",
  };
  const steps: ProjectState["steps"] = pipeline.map((step, index) => ({
    step,
    state: index < current ? "done" : index === current ? atCurrent[phase] : "todo",
  }));
  if (project.kind === "template") {
    steps.push({ step: "iterations", state: iterationCount > 0 ? "done" : phase === "done" ? "current" : "todo" });
  } else {
    steps.push({
      step: "export",
      state: rendering ? "running" : renders.length > 0 ? "done" : phase === "done" ? "current" : "todo",
    });
  }

  return { phase, claudeJob, renderJob, rendering, steps };
}

/** Newest Claude job that ran this step (its log and its review belong to the step page). */
export function stepJob(jobs: Job[], step: GenerationStep): Job | null {
  return jobs.find((job) => job.kind === "claude" && job.step === step) ?? null;
}

/** A step's files exist once it finished at least once: an earlier step, or the current one under review or done. */
export function stepReached(project: StateProject, state: Pick<ProjectState, "phase">, step: GenerationStep) {
  const pipeline = stepsFor(project.kind);
  const index = pipeline.indexOf(step);
  const current = pipeline.indexOf(project.currentStep);
  if (index < 0) return false;
  return index < current || (index === current && (state.phase === "review" || state.phase === "done"));
}

/** Why the Studio HyperFrames cannot be opened right now, or null when it can. */
export function studioBlockedReason(project: StateProject, state: Pick<ProjectState, "phase">) {
  if (state.phase === "running") return "Claude travaille sur ce projet : attends la fin de l'étape.";
  if (!stepReached(project, state, "build")) return "Disponible une fois le build terminé.";
  return null;
}
