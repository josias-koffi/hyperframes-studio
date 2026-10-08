import { stepsFor, type GenerationStep } from "@studio/shared/browser";
import { PIPELINE, STEP_LABELS } from "@/components/studio/labels";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import type { ProjectData } from "@/lib/project-data";
import { stepJob, type PipelineStep } from "@/lib/project-state";
import { StepAction } from "./step-action";
import { StepLog } from "./step-log";

/** Title and explanation of one screen of the project. */
export function StepHeader({ step, aside }: { step: PipelineStep; aside?: React.ReactNode }) {
  const { label, hint, icon: Icon } = PIPELINE[step];
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-4" />
        </span>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{label}</h2>
          <p className="max-w-2xl text-sm text-muted-foreground">{hint}</p>
        </div>
      </div>
      {aside}
    </div>
  );
}

/**
 * A generation step's screen: what it is, the action when it is the current step, what it produced
 * (`children`, only once reached), and its Claude log folded at the bottom. `reviewInContent` leaves the
 * review to the content (the variables editor validates what it edits).
 */
export function StepPage({
  data,
  step,
  reached,
  reviewInContent,
  children,
}: {
  data: ProjectData;
  step: GenerationStep;
  reached: boolean;
  reviewInContent?: boolean;
  children: React.ReactNode;
}) {
  const { project, state, jobs } = data;
  const job = stepJob(jobs, step);
  const isCurrent = project.currentStep === step && state.phase !== "done";
  const pipeline = stepsFor(project.kind);
  const previous = pipeline[pipeline.indexOf(step) - 1];

  return (
    <div className="flex flex-col gap-6">
      <StepHeader step={step} />
      {isCurrent && !(reviewInContent && state.phase === "review") && <StepAction project={project} state={state} />}
      {reached ? (
        children
      ) : !isCurrent ? (
        <Empty className="border bg-card shadow-surface">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              {(() => {
                const Icon = PIPELINE[step].icon;
                return <Icon />;
              })()}
            </EmptyMedia>
            <EmptyTitle>Pas encore là</EmptyTitle>
            <EmptyDescription>
              Cette étape viendra après {previous ? `l'étape « ${STEP_LABELS[previous]} »` : "le lancement"}.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}
      {job && <StepLog key={job.id} job={job} />}
    </div>
  );
}
