import { ShotsReview } from "@/components/creation/shots-review";
import { StepPage } from "@/components/project/step-page";
import { loadCreation } from "@/lib/creation-data";
import { stepJob, stepReached } from "@/lib/creation-state";
import { serverFile } from "@/lib/server-api";
import { parseShots } from "@/lib/shots";

/** A realistic création's keyframes (an image per shot), one card per generated shot, reviewed one by one. */
export default async function KeyframesPage({ params }: PageProps<"/projects/[id]/creations/[creationId]/keyframes">) {
  const { creationId: id } = await params;
  const data = await loadCreation(id);
  const reached = stepReached(data.creation, data.state, "keyframes");
  const [storyboard, meta, budget] = reached
    ? await Promise.all([serverFile(id, "STORYBOARD.json"), serverFile(id, "shots_meta.json"), serverFile(id, "shots_budget.json")])
    : [null, null, null];
  const shots = parseShots(storyboard, meta, budget);
  const current = data.creation.currentStep === "keyframes";

  return (
    <StepPage data={data} step="keyframes" reached={reached} reviewInContent>
      {shots && (
        <ShotsReview
          creationId={id}
          step="keyframes"
          data={shots}
          review={current && data.state.phase === "review"}
          failed={current && data.state.phase === "failed"}
          version={stepJob(data.jobs, "keyframes")?.id}
        />
      )}
    </StepPage>
  );
}
