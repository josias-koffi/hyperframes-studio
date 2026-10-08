import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { CrumbLabel } from "@/components/layout/crumb-label";
import { CreationActions } from "@/components/project/creation-actions";
import { CreationRail } from "@/components/project/creation-rail";
import { OpenStudioButton } from "@/components/project/open-studio-button";
import { CREATION_TYPE_META, formatSummary } from "@/components/studio/labels";
import { PhaseBadge } from "@/components/studio/status-badge";
import { Badge } from "@/components/ui/badge";
import { loadCreation } from "@/lib/creation-data";
import { formatRelative } from "@/lib/format";
import { creationHref, projectHref, studioBlockedReason } from "@/lib/creation-state";

/** Header and step rail shared by every screen of a création. A création opened under another project is sent to its own. */
export async function CreationShell({ projectId, id, children }: { projectId: string; id: string; children: React.ReactNode }) {
  const { creation, state, assets } = await loadCreation(id).catch(() => notFound());
  if (creation.projectId !== projectId) redirect(creationHref(creation));
  const { label, icon: Icon } = CREATION_TYPE_META[creation.type];
  const studioBlocked = studioBlockedReason(creation, state);
  const base = creationHref(creation);

  return (
    <>
      <CrumbLabel segment={creation.projectId} label={creation.projectName} />
      <CrumbLabel segment={creation.id} label={creation.name} />
      <div className="flex rise-in flex-col gap-3 px-4 md:flex-row md:items-end md:justify-between lg:px-6">
        <div className="min-w-0 space-y-1">
          <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-primary uppercase">
            <Icon className="size-3.5" />
            {label}
            {creation.kind === "template" && (
              <Badge variant="secondary" className="ml-1 normal-case">
                Template
              </Badge>
            )}
          </p>
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight">
            {creation.name}
            <PhaseBadge phase={state.phase} type={creation.type} />
          </h1>
          <p className="text-sm text-muted-foreground">
            <Link href={projectHref(creation.projectId)} className="font-medium text-foreground hover:underline">
              {creation.projectName}
            </Link>{" "}
            · {formatSummary(creation)} · modifié {formatRelative(creation.updatedAt)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <OpenStudioButton base={base} disabledReason={studioBlocked} />
          <CreationActions creation={creation} deleteBlocked={state.phase === "running"} />
        </div>
      </div>
      <div className="flex flex-col gap-4 px-4 lg:flex-row lg:gap-8 lg:px-6">
        <CreationRail base={base} type={creation.type} steps={state.steps} assetCount={assets.length} />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </>
  );
}
