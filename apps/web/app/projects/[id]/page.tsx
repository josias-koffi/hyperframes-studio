import { ProjectWorkbench } from "@/components/studio/project-workbench";
import { RendersPanel } from "@/components/studio/renders-panel";
import { SaveTemplateButton } from "@/components/studio/save-template-button";
import { serverApi, type Job, type Project, type Render } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: PageProps<"/projects/[id]">) {
  const { id } = await params;
  const [project, jobs, renders] = await Promise.all([
    serverApi<Project>(`/projects/${id}`),
    serverApi<Job[]>(`/projects/${id}/jobs`),
    serverApi<Render[]>(`/projects/${id}/renders`),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
        <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
        <p className="font-mono text-sm text-muted-foreground">
          videos/{project.slug} · {project.workflow}
        </p>
        </div>
        <SaveTemplateButton projectId={project.id} name={project.name} />
      </div>
      <ProjectWorkbench project={project} jobs={jobs} />
      <RendersPanel projectId={project.id} renders={renders} lastRenderJob={jobs.find((job) => job.kind === "render") ?? null} />
    </div>
  );
}
