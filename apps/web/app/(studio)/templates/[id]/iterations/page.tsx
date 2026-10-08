import { LayersIcon } from "lucide-react";
import type { Metadata } from "next";
import { StepHeader } from "@/components/project/step-page";
import { IterationsTable } from "@/components/template/iterations-table";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { serverApi, type ProjectVariables } from "@/lib/api";
import { loadProject } from "@/lib/project-data";

export const metadata: Metadata = { title: "Itérations" };

/** The uses of a template, once it is built: each one a set of values and its renders. */
export default async function IterationsPage({ params }: PageProps<"/templates/[id]/iterations">) {
  const { id } = await params;
  const { project, state, iterations } = await loadProject(id);
  const built = state.phase === "done" || iterations.length > 0;
  const { declared } = built ? await serverApi<ProjectVariables>(`/projects/${id}/variables`) : { declared: [] };

  return (
    <div className="flex flex-col gap-6">
      <StepHeader step="iterations" />
      {built ? (
        <IterationsTable projectId={project.id} iterations={iterations} declared={declared} />
      ) : (
        <Empty className="border bg-card shadow-surface">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <LayersIcon />
            </EmptyMedia>
            <EmptyTitle>Le template n&apos;est pas encore construit</EmptyTitle>
            <EmptyDescription>
              Les itérations s&apos;ouvrent une fois le build validé : la première, avec les valeurs par défaut, est alors
              rendue automatiquement.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
}
