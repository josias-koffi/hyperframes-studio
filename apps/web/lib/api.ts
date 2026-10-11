import type {
  AgentBackend,
  AiModelKind,
  ModelCapability,
  AiPreferences,
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
  /** Covers of its first créations, for the card. */
  covers: Cover[];
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
  cover: Cover | null;
};

/** What a card shows of a création: its newest still, else its newest video render. */
export type Cover = { url: string; kind: "image" | "video" };

export type Job = {
  id: string;
  creationId: string;
  iterationId: string | null;
  kind: "claude" | "render";
  step: GenerationStep | null;
  status: JobStatus;
  resultText: string | null;
  /** Generation jobs: what ran the turn and what it cost (USD, as reported by the backend). */
  backend?: AgentBackend | null;
  model?: string | null;
  costUsd?: number | null;
  createdAt: string;
  finishedAt: string | null;
};

/** A model of the catalog the admin offers (`GET /ai-models`, `GET /admin/ai-models`). */
export type AiModel = {
  id: string;
  openrouterId: string;
  kind: AiModelKind;
  label: string;
  description: string;
  enabled: boolean;
  voices: string[];
  pricing: Record<string, string>;
  contextLength: number | null;
  capabilities: ModelCapability[];
  createdAt: string;
  updatedAt: string;
};

/** `GET /me/ai-settings`: the person's choices and what they fall back to. */
export type AiSettings = {
  preferences: AiPreferences;
  agentBackend: AgentBackend;
  defaults: AiPreferences;
};

/** One model of OpenRouter's list, in the admin import dialog. */
export type OpenRouterModel = {
  id: string;
  name: string;
  description: string;
  contextLength: number | null;
  pricing: Record<string, string>;
  kinds: AiModelKind[];
  capabilities: ModelCapability[];
  voices: string[];
  /** Kinds it is already offered as. */
  inCatalog: AiModelKind[];
};

type UsageTotals = { jobs: number; costUsd: number; subscriptionUsd: number };
type TokenTotals = { inputTokens: number; outputTokens: number };

/** `GET /admin/usage`: generation costs; `subscriptionUsd` is Claude Code at API prices, not billed. */
export type AiUsage = {
  days: number;
  since: string;
  totals: UsageTotals & TokenTotals;
  byDay: (UsageTotals & { day: string })[];
  byUser: (UsageTotals & TokenTotals & { userId: string; email: string; name: string | null })[];
  byModel: (TokenTotals & { backend: AgentBackend; model: string | null; jobs: number; costUsd: number })[];
  /** Steps that fell back to the escalation slot, per escalation model, with the cost of the escalated turns. */
  escalations: { model: string | null; steps: string[]; jobs: number; costUsd: number }[];
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

export async function clientApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  const body = await response.json().catch(() => null);
  // The session ended: the page that says to relaunch the app.
  if (response.status === 401 && typeof window !== "undefined") {
    // A full load, not a client navigation: every cached screen belonged to the session that ended.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/login";
  }
  if (!response.ok) {
    const message = body && typeof body.message === "string" ? body.message : `Erreur ${response.status}`;
    throw new Error(message);
  }
  return body as T;
}
