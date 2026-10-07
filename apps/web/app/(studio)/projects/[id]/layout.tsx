import { CrumbLabel } from "@/components/layout/crumb-label";
import { OpenStudioButton } from "@/components/project/open-studio-button";
import { ProjectRail } from "@/components/project/project-rail";
import { workflowMeta } from "@/components/studio/labels";
import { PhaseBadge } from "@/components/studio/status-badge";
import { formatRelative } from "@/lib/format";
import { loadProject } from "@/lib/project-data";
import { studioBlockedReason } from "@/lib/project-state";

export const dynamic = "force-dynamic";

/** Header and step rail shared by every screen of a project. */
export default async function ProjectLayout({ children, params }: LayoutProps<"/projects/[id]">) {
  const { id } = await params;
  const { project, state, assets } = await loadProject(id);
  const { label, icon: Icon } = workflowMeta(project.workflow);
  const studioBlocked = studioBlockedReason(project, state);

  return (
    <>
      <CrumbLabel label={project.name} />
      <div className="flex rise-in flex-col gap-3 px-4 md:flex-row md:items-end md:justify-between lg:px-6">
        <div className="min-w-0 space-y-1">
          <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-primary uppercase">
            <Icon className="size-3.5" />
            {label}
          </p>
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight">
            {project.name}
            <PhaseBadge phase={state.phase} />
          </h1>
          <p className="text-sm text-muted-foreground">
            <span className="font-mono">videos/{project.slug}</span> · modifié {formatRelative(project.updatedAt)}
          </p>
        </div>
        <OpenStudioButton projectId={project.id} disabledReason={studioBlocked} />
      </div>
      <div className="flex flex-col gap-4 px-4 lg:flex-row lg:gap-8 lg:px-6">
        <ProjectRail projectId={project.id} steps={state.steps} assetCount={assets.length} />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </>
  );
}
