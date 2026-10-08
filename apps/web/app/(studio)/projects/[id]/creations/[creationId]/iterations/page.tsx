import { LayersIcon } from "lucide-react";
import type { Metadata } from "next";
import { StepHeader } from "@/components/project/step-page";
import { IterationsTable } from "@/components/template/iterations-table";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { type CreationVariables } from "@/lib/api";
import { serverApi } from "@/lib/server-api";
import { loadCreation } from "@/lib/creation-data";

export const metadata: Metadata = { title: "Itérations" };

/** The uses of a template, once it is built: each one a set of values and its renders. */
export default async function IterationsPage({ params }: PageProps<"/projects/[id]/creations/[creationId]/iterations">) {
  const { creationId: id } = await params;
  const { creation, state, iterations } = await loadCreation(id);
  const built = state.phase === "done" || iterations.length > 0;
  const { declared } = built ? await serverApi<CreationVariables>(`/creations/${id}/variables`) : { declared: [] };

  return (
    <div className="flex flex-col gap-6">
      <StepHeader step="iterations" type={creation.type} />
      {built ? (
        <IterationsTable creation={creation} iterations={iterations} declared={declared} />
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
