import { stepsFor, type CreationShape, type GenerationStep } from "@studio/shared/browser";
import type { Creation, CreationListItem, Job } from "./api";

/** Where a création stands, from the user's point of view: what they should do next. */
export type CreationPhase =
  /** No Claude job yet, or the last one stopped without a follow-up: the user launches the current step. */
  | "idle"
  | "running"
  | "review"
  | "failed"
  /** The build checkpoint was approved: only exports (or iterations of a template) remain. */
  | "done";

export type StepState = "done" | "current" | "running" | "review" | "failed" | "todo";

/** After the build, a one-shot création is exported; a template is used as iterations. */
export type PipelineStep = GenerationStep | "export" | "iterations";

/** URL segment of each step page. Lives here, not in a "use client" module, so server pages can read it. */
export const STEP_SEGMENTS: Record<PipelineStep, string> = {
  brief: "brief",
  footage: "footage",
  variables: "variables",
  storyboard: "storyboard",
  keyframes: "keyframes",
  shots: "shots",
  media: "media",
  build: "build",
  export: "exports",
  iterations: "iterations",
};

export function projectHref(projectId: string, segment?: string): string {
  return segment ? `/projects/${projectId}/${segment}` : `/projects/${projectId}`;
}

/** A création lives under its project. */
export function creationHref(creation: { id: string; projectId: string }, segment?: string): string {
  const base = `/projects/${creation.projectId}/creations/${creation.id}`;
  return segment ? `${base}/${segment}` : base;
}

export type CreationState = {
  phase: CreationPhase;
  /** Newest Claude job, which drives the workbench. */
  claudeJob: Job | null;
  /** Newest render job. */
  renderJob: Job | null;
  rendering: boolean;
  steps: { step: PipelineStep; state: StepState }[];
};

const LIVE: Job["status"][] = ["queued", "running"];

type StateCreation = Pick<Creation, "currentStep"> & CreationShape;

/**
 * `jobs` come newest first, as `GET /creations/:id/jobs` returns them. The last stop is done once it holds
 * something: the exports of a one-shot création, the iterations of a template.
 */
export function creationState(creation: StateCreation, jobs: Job[], renderCount = 0, iterationCount = 0): CreationState {
  const claudeJob = jobs.find((job) => job.kind === "claude") ?? null;
  const renderJob = jobs.find((job) => job.kind === "render") ?? null;
  const rendering = renderJob !== null && LIVE.includes(renderJob.status);

  let phase: CreationPhase = "idle";
  if (claudeJob) {
    if (LIVE.includes(claudeJob.status)) phase = "running";
    else if (claudeJob.status === "waiting_review") phase = "review";
    else if (claudeJob.status === "failed") phase = "failed";
    else if (claudeJob.step === "build" && claudeJob.status === "succeeded") phase = "done";
  }

  const pipeline = stepsFor(creation);
  const current = pipeline.indexOf(creation.currentStep);
  const atCurrent: Record<CreationPhase, StepState> = {
    idle: "current",
    running: "running",
    review: "review",
    failed: "failed",
    done: "done",
  };
  const steps: CreationState["steps"] = pipeline.map((step, index) => ({
    step,
    state: index < current ? "done" : index === current ? atCurrent[phase] : "todo",
  }));
  if (creation.kind === "template") {
    steps.push({ step: "iterations", state: iterationCount > 0 ? "done" : phase === "done" ? "current" : "todo" });
  } else {
    steps.push({
      step: "export",
      state: rendering ? "running" : renderCount > 0 ? "done" : phase === "done" ? "current" : "todo",
    });
  }

  return { phase, claudeJob, renderJob, rendering, steps };
}

/** The state of a list item, from the newest jobs and counts the list carries. */
export function itemState(item: CreationListItem): CreationState {
  const jobs = [item.lastClaudeJob, item.lastRenderJob].filter((job): job is Job => job !== null);
  jobs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return creationState(item, jobs, item.renderCount, item.iterationCount);
}

/** Newest Claude job that ran this step (its log and its review belong to the step page). */
export function stepJob(jobs: Job[], step: GenerationStep): Job | null {
  return jobs.find((job) => job.kind === "claude" && job.step === step) ?? null;
}

/** A step's files exist once it finished at least once: an earlier step, or the current one under review or done. */
export function stepReached(creation: StateCreation, state: Pick<CreationState, "phase">, step: GenerationStep) {
  const pipeline = stepsFor(creation);
  const index = pipeline.indexOf(step);
  const current = pipeline.indexOf(creation.currentStep);
  if (index < 0) return false;
  return index < current || (index === current && (state.phase === "review" || state.phase === "done"));
}

/** Why the editor cannot be opened right now, or null when it can. */
export function studioBlockedReason(creation: StateCreation, state: Pick<CreationState, "phase">) {
  if (state.phase === "running") return "Claude travaille sur cette création : attends la fin de l'étape.";
  return editorBlockedReason(creation, state);
}

/**
 * Why the editor page has nothing to show. Unlike the button, it opens while Claude works on a change asked
 * from the editor: it shows the change in progress and waits.
 */
export function editorBlockedReason(creation: StateCreation, state: Pick<CreationState, "phase">) {
  if (!stepReached(creation, state, "build") && !(creation.currentStep === "build" && state.phase === "running")) {
    return "Disponible une fois le build terminé.";
  }
  return null;
}

/** Splits a render's files: the slides or frames to show, and the PDF of a carousel. */
export function renderFiles(render: { storageKeys: string[]; urls: string[] }) {
  const files = render.storageKeys.map((key, index) => ({ key, url: render.urls[index], name: key.split("/").pop() ?? key }));
  return {
    images: files.filter((file) => /\.(png|jpe?g|gif)$/i.test(file.key)),
    pdf: files.find((file) => file.key.toLowerCase().endsWith(".pdf")) ?? null,
    video: files.find((file) => /\.(mp4|webm|mov)$/i.test(file.key)) ?? null,
  };
}
