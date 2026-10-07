import { serverApi, type Job, type Project } from "./api";
import { projectState, type ProjectState } from "./project-state";

export type ProjectOverview = Project & { state: ProjectState };

/** Every project with where it stands. One jobs call per project: fine at a studio's scale. */
export async function loadOverview(): Promise<ProjectOverview[]> {
  const projects = await serverApi<Project[]>("/projects");
  const jobs = await Promise.all(projects.map((project) => serverApi<Job[]>(`/projects/${project.id}/jobs`)));
  return projects.map((project, index) => ({ ...project, state: projectState(project, jobs[index]) }));
}
