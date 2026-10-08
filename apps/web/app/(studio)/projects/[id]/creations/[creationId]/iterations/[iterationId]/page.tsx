import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CrumbLabel } from "@/components/layout/crumb-label";
import { SectionCard } from "@/components/layout/section-card";
import { RendersPanel } from "@/components/studio/renders-panel";
import { IterationActions } from "@/components/template/iteration-actions";
import { IterationForm } from "@/components/template/iteration-form";
import { Button } from "@/components/ui/button";
import { type Iteration, type Job, type CreationVariables, type Render } from "@/lib/api";
import { serverApi } from "@/lib/server-api";
import { formatRelative } from "@/lib/format";
import { loadCreation } from "@/lib/creation-data";
import { creationHref } from "@/lib/creation-state";

export async function generateMetadata({ params }: PageProps<"/projects/[id]/creations/[creationId]/iterations/[iterationId]">): Promise<Metadata> {
  const { iterationId } = await params;
  return { title: (await serverApi<Iteration>(`/iterations/${iterationId}`)).name };
}

/** One iteration: its values, kept between visits, and every render made from them. */
export default async function IterationPage({ params }: PageProps<"/projects/[id]/creations/[creationId]/iterations/[iterationId]">) {
  const { creationId: id, iterationId } = await params;
  const [{ creation, state }, iteration, renders, jobs, variables] = await Promise.all([
    loadCreation(id),
    serverApi<Iteration>(`/iterations/${iterationId}`),
    serverApi<Render[]>(`/iterations/${iterationId}/renders`),
    serverApi<Job[]>(`/iterations/${iterationId}/jobs`),
    serverApi<CreationVariables>(`/creations/${id}/variables`),
  ]);
  const lastJob = jobs[0] ?? null;
  const rendering = lastJob !== null && ["queued", "running"].includes(lastJob.status);
  const blockedReason =
    state.phase === "running"
      ? "Claude met le template à jour : la génération reprend à la fin de l'étape."
      : rendering
        ? "Un rendu de cette itération est en cours."
        : null;

  return (
    <div className="flex flex-col gap-6">
      <CrumbLabel segment={iteration.id} label={iteration.name} />
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button asChild variant="ghost" size="icon" aria-label="Retour aux itérations">
            <Link href={creationHref(creation, "iterations")}>
              <ArrowLeftIcon />
            </Link>
          </Button>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">{iteration.name}</h2>
            <p className="text-sm text-muted-foreground">
              Itération de {creation.name} · modifiée {formatRelative(iteration.updatedAt)}
            </p>
          </div>
        </div>
        <IterationActions iteration={iteration} base={creationHref(creation, "iterations")} leaveOnDelete />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        <SectionCard title="Valeurs" description="Change les variables puis génère : le rendu part sans Claude.">
          <IterationForm key={iteration.updatedAt} type={creation.type} iteration={iteration} declarations={variables.declared} blockedReason={blockedReason} />
        </SectionCard>
        <RendersPanel
          creation={creation}
          renders={renders}
          lastRenderJob={lastJob}
          hideActions
          values={{ declarations: variables.declared, current: iteration.values }}
        />
      </div>
    </div>
  );
}
