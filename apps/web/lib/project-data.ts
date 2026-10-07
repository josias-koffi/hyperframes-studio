import { cache } from "react";
import { serverApi, type Asset, type Job, type Project, type Render } from "./api";
import { projectState } from "./project-state";

/** One fetch per request, shared by the project layout and whichever step page it wraps. */
export const loadProject = cache(async (id: string) => {
  const [project, jobs, renders, assets] = await Promise.all([
    serverApi<Project>(`/projects/${id}`),
    serverApi<Job[]>(`/projects/${id}/jobs`),
    serverApi<Render[]>(`/projects/${id}/renders`),
    serverApi<Asset[]>(`/assets?projectId=${id}`),
  ]);
  return { project, jobs, renders, assets, state: projectState(project, jobs, renders) };
});

export type ProjectData = Awaited<ReturnType<typeof loadProject>>;
