import type {
  CompositionVariable,
  CreationKind,
  CreationType,
  GenerationStep,
  JobStatus,
  RenderFormat,
  StudioEvent,
  VariablesDiff,
} from "@studio/shared/browser";

/** A campaign: the créations it holds share its name, context and assets. */
export type Project = {
  id: string;
  name: string;
  brandId: string | null;
  context: string;
  createdAt: string;
  updatedAt: string;
};

/** `GET /projects`: what each project holds and what waits on the user. */
export type ProjectListItem = Project & {
  counts: Record<CreationType, number>;
  templateCount: number;
  reviewCount: number;
  runningCount: number;
  /** First images of its stills, for the card. */
  covers: string[];
  activityAt: string;
};

/** A video, a carousel or an image of a project: one folder `videos/<slug>`, one pipeline. */
export type Creation = {
  id: string;
  projectId: string;
  projectName: string;
  slug: string;
  name: string;
  type: CreationType;
  kind: CreationKind;
  workflow: string;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  slideCount: number | null;
  brief: Record<string, unknown>;
  currentStep: GenerationStep;
  claudeSessionId: string | null;
  createdAt: string;
  updatedAt: string;
};

/** `GET /projects/:id/creations` and `GET /creations`: where each création stands. */
export type CreationListItem = Creation & {
  lastClaudeJob: Job | null;
  lastRenderJob: Job | null;
  renderCount: number;
  iterationCount: number;
  variableCount: number | null;
  cover: string | null;
};

export type Job = {
  id: string;
  creationId: string;
  iterationId: string | null;
  kind: "claude" | "render";
  step: GenerationStep | null;
  status: JobStatus;
  resultText: string | null;
  createdAt: string;
  finishedAt: string | null;
};

export type Render = {
  id: string;
  iterationId: string | null;
  format: RenderFormat;
  /** Values an iteration render was made with. */
  variables: Record<string, unknown> | null;
  storageKeys: string[];
  urls: string[];
  createdAt: string;
};

/** `GET /creations/:id/variables`: the validated contract and what the composition declares. */
export type CreationVariables = {
  proposed: CompositionVariable[] | null;
  declared: CompositionVariable[];
  diff: VariablesDiff | null;
  errors: string[];
};

/** One use of a template: named values and the renders made from them. */
export type Iteration = {
  id: string;
  creationId: string;
  name: string;
  values: Record<string, unknown>;
  format: RenderFormat;
  createdAt: string;
  updatedAt: string;
};

export type IterationListItem = Iteration & { lastJob: Job | null; lastRender: Render | null };

export type AssetKind = "image" | "video" | "audio" | "font" | "logo" | "document" | "other";

export type Asset = {
  id: string;
  projectId: string | null;
  /** Set when uploaded for one création only (its footage, its music). */
  creationId: string | null;
  kind: AssetKind;
  filename: string;
  contentType: string;
  size: number;
  tags: string[];
  createdAt: string;
  /** Short-lived download URL, for previews. */
  url: string;
};

export type JobStreamMessage = { seq?: number; event?: StudioEvent; status?: JobStatus };

/** A file of the création's folder (BRIEF.md, audio_meta.json…) as text, or null when it does not exist yet. */
export async function serverFile(creationId: string, path: string): Promise<string | null> {
  const base = process.env.API_URL ?? "http://localhost:3343";
  const response = await fetch(`${base}/creations/${creationId}/files/${path}`, { cache: "no-store" });
  return response.ok ? response.text() : null;
}

/** Server components call the API directly on the internal network; the browser goes through `/api`. */
export async function serverApi<T>(path: string): Promise<T> {
  const base = process.env.API_URL ?? "http://localhost:3343";
  const response = await fetch(`${base}${path}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return (await response.json()) as T;
}

export async function clientApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && typeof body.message === "string" ? body.message : `Erreur ${response.status}`;
    throw new Error(message);
  }
  return body as T;
}
