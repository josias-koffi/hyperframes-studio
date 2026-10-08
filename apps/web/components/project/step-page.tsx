import { stepsFor, type GenerationStep } from "@studio/shared/browser";
import { notFound } from "next/navigation";
import type { CreationType } from "@studio/shared/browser";
import { stepMeta } from "@/components/studio/labels";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import type { CreationData } from "@/lib/creation-data";
import { stepJob, type PipelineStep } from "@/lib/creation-state";
import { StepAction } from "./step-action";
import { StepLog } from "./step-log";

/** Title and explanation of one screen of the création. */
export function StepHeader({ step, type, aside }: { step: PipelineStep; type: CreationType; aside?: React.ReactNode }) {
  const { label, hint, icon: Icon } = stepMeta(step, type);
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
  data: CreationData;
  step: GenerationStep;
  reached: boolean;
  reviewInContent?: boolean;
  children: React.ReactNode;
}) {
  const { creation, state, jobs } = data;
  const job = stepJob(jobs, step);
  const isCurrent = creation.currentStep === step && state.phase !== "done";
  const pipeline = stepsFor(creation);
  if (!pipeline.includes(step)) notFound();
  const previous = pipeline[pipeline.indexOf(step) - 1];
  const meta = stepMeta(step, creation.type);

  return (
    <div className="flex flex-col gap-6">
      <StepHeader step={step} type={creation.type} />
      {isCurrent && !(reviewInContent && state.phase === "review") && <StepAction creation={creation} state={state} />}
      {reached ? (
        children
      ) : !isCurrent ? (
        <Empty className="border bg-card shadow-surface">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <meta.icon />
            </EmptyMedia>
            <EmptyTitle>Pas encore là</EmptyTitle>
            <EmptyDescription>
              Cette étape viendra après {previous ? `l'étape « ${stepMeta(previous, creation.type).label} »` : "le lancement"}.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}
      {job && <StepLog key={job.id} job={job} />}
    </div>
  );
}
