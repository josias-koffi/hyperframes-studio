import type { ProjectKind } from "@studio/shared/browser";
import { redirect } from "next/navigation";
import { CrumbLabel } from "@/components/layout/crumb-label";
import { OpenStudioButton } from "@/components/project/open-studio-button";
import { ProjectActions } from "@/components/project/project-actions";
import { ProjectRail } from "@/components/project/project-rail";
import { workflowMeta } from "@/components/studio/labels";
import { PhaseBadge } from "@/components/studio/status-badge";
import { Badge } from "@/components/ui/badge";
import { formatRelative } from "@/lib/format";
import { loadProject } from "@/lib/project-data";
import { projectHref, studioBlockedReason } from "@/lib/project-state";

/**
 * Header and step rail shared by every screen of a project, under `/projects` for a one-shot video and under
 * `/templates` for a template. A project opened in the other section is sent to its own.
 */
export async function ProjectShell({ id, section, children }: { id: string; section: ProjectKind; children: React.ReactNode }) {
  const { project, state, assets } = await loadProject(id);
  if (project.kind !== section) redirect(projectHref(project));
  const { label, icon: Icon } = workflowMeta(project.workflow);
  const studioBlocked = studioBlockedReason(project, state);
  const base = projectHref(project);

  return (
    <>
      <CrumbLabel segment={project.id} label={project.name} />
      <div className="flex rise-in flex-col gap-3 px-4 md:flex-row md:items-end md:justify-between lg:px-6">
        <div className="min-w-0 space-y-1">
          <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-primary uppercase">
            <Icon className="size-3.5" />
            {label}
            {project.kind === "template" && (
              <Badge variant="secondary" className="ml-1 normal-case">
                Template
              </Badge>
            )}
          </p>
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight">
            {project.name}
            <PhaseBadge phase={state.phase} />
          </h1>
          <p className="text-sm text-muted-foreground">
            <span className="font-mono">videos/{project.slug}</span> · modifié {formatRelative(project.updatedAt)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <OpenStudioButton base={base} disabledReason={studioBlocked} />
          <ProjectActions project={project} deleteBlocked={state.phase === "running"} />
        </div>
      </div>
      <div className="flex flex-col gap-4 px-4 lg:flex-row lg:gap-8 lg:px-6">
        <ProjectRail base={base} steps={state.steps} assetCount={assets.length} />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </>
  );
}
