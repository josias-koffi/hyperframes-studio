import type { CompositionVariable, GenerationStep, JobStatus, RenderFormat, StudioEvent } from "@studio/shared/browser";

export type Project = {
  id: string;
  slug: string;
  name: string;
  workflow: string;
  brief: Record<string, unknown>;
  currentStep: GenerationStep;
  claudeSessionId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Job = {
  id: string;
  projectId: string;
  kind: "claude" | "render";
  step: GenerationStep | null;
  status: JobStatus;
  resultText: string | null;
  createdAt: string;
  finishedAt: string | null;
};

export type Render = {
  id: string;
  format: RenderFormat;
  storageKeys: string[];
  urls: string[];
  createdAt: string;
};

export type Template = {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  variables: CompositionVariable[];
};

export type JobStreamMessage = { seq?: number; event?: StudioEvent; status?: JobStatus };

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
