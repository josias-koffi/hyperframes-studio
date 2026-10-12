import { ShotsReview } from "@/components/creation/shots-review";
import { StepPage } from "@/components/project/step-page";
import { loadCreation } from "@/lib/creation-data";
import { stepJob, stepReached } from "@/lib/creation-state";
import { serverFile } from "@/lib/server-api";
import { parseShots } from "@/lib/shots";

/** A realistic création's shots (a video per keyframe), one card per generated shot, reviewed one by one. */
export default async function ShotsPage({ params }: PageProps<"/projects/[id]/creations/[creationId]/shots">) {
  const { creationId: id } = await params;
  const data = await loadCreation(id);
  const reached = stepReached(data.creation, data.state, "shots");
  const [storyboard, meta, budget, guard] = reached
    ? await Promise.all([serverFile(id, "STORYBOARD.json"), serverFile(id, "shots_meta.json"), serverFile(id, "shots_budget.json"), serverFile(id, "shots_guard.json")])
    : [null, null, null, null];
  const shots = parseShots(storyboard, meta, budget, guard);
  const current = data.creation.currentStep === "shots";

  return (
    <StepPage data={data} step="shots" reached={reached} reviewInContent>
      {shots && (
        <ShotsReview
          creationId={id}
          step="shots"
          data={shots}
          review={current && data.state.phase === "review"}
          failed={current && data.state.phase === "failed"}
          version={stepJob(data.jobs, "shots")?.id}
        />
      )}
    </StepPage>
  );
}
