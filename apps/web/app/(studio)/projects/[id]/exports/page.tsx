import { StepHeader } from "@/components/project/step-page";
import { RendersPanel } from "@/components/studio/renders-panel";
import { loadProject } from "@/lib/project-data";

export default async function ExportsPage({ params }: PageProps<"/projects/[id]/exports">) {
  const { id } = await params;
  const { project, renders, state } = await loadProject(id);
  return (
    <div className="flex flex-col gap-6">
      <StepHeader step="export" />
      <RendersPanel projectId={project.id} renders={renders} lastRenderJob={state.renderJob} />
    </div>
  );
}
