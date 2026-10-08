import { StepHeader } from "@/components/project/step-page";
import { RendersPanel } from "@/components/studio/renders-panel";
import { loadCreation } from "@/lib/creation-data";

export default async function ExportsPage({ params }: PageProps<"/projects/[id]/creations/[creationId]/exports">) {
  const { creationId: id } = await params;
  const { creation, renders, state } = await loadCreation(id);
  return (
    <div className="flex flex-col gap-6">
      <StepHeader step="export" type={creation.type} />
      <RendersPanel creation={creation} renders={renders} lastRenderJob={state.renderJob} />
    </div>
  );
}
