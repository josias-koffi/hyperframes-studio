import type { ProjectKind } from "@studio/shared/browser";
import { serverApi, type Job, type ProjectListItem } from "./api";
import { projectState, type ProjectState } from "./project-state";

export type ProjectOverview = ProjectListItem & { state: ProjectState };

/** Projects (of one kind, or all) with where they stand. One jobs call per project: fine at a studio's scale. */
export async function loadOverview(kind?: ProjectKind): Promise<ProjectOverview[]> {
  const projects = await serverApi<ProjectListItem[]>(kind ? `/projects?kind=${kind}` : "/projects");
  const jobs = await Promise.all(projects.map((project) => serverApi<Job[]>(`/projects/${project.id}/jobs`)));
  return projects.map((project, index) => ({
    ...project,
    state: projectState(project, jobs[index], [], project.iterationCount ?? 0),
  }));
}
