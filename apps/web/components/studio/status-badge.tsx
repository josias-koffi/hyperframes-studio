import type { JobStatus } from "@studio/shared/browser";
import type { ProjectPhase, ProjectState, StepState } from "@/lib/project-state";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STATUS_LABELS } from "./labels";

const TONES: Record<JobStatus, string> = {
  queued: "border-info/30 bg-info/10 text-info",
  running: "border-rec/30 bg-rec/10 text-rec",
  waiting_review: "border-warning/30 bg-warning/10 text-warning",
  succeeded: "border-success/30 bg-success/10 text-success",
  failed: "border-destructive/30 bg-destructive/10 text-destructive",
  cancelled: "text-muted-foreground",
};

/** One color per job status, the same everywhere: live work is "rec" coral and pulses. */
export function StatusBadge({ status, label, className }: { status: JobStatus; label?: string; className?: string }) {
  return (
    <Badge variant="outline" className={cn("gap-1.5", TONES[status], className)}>
      {status === "running" && <span className="rec-dot size-1.5" />}
      {label ?? STATUS_LABELS[status]}
    </Badge>
  );
}

const PHASES: Record<ProjectPhase, { status: JobStatus; label: string }> = {
  idle: { status: "queued", label: "À lancer" },
  running: { status: "running", label: "En génération" },
  review: { status: "waiting_review", label: "À valider" },
  failed: { status: "failed", label: "Échec" },
  done: { status: "succeeded", label: "Vidéo prête" },
};

/** A project's phase, worded for what the user has to do. */
export function PhaseBadge({ phase, className }: { phase: ProjectPhase; className?: string }) {
  const { status, label } = PHASES[phase];
  return <StatusBadge status={status} label={label} className={className} />;
}

const DOTS: Record<StepState, string> = {
  done: "bg-success",
  current: "bg-primary",
  running: "bg-rec",
  review: "bg-warning",
  failed: "bg-destructive",
  todo: "bg-border",
};

/** The four generation steps squeezed into a table cell; exports need the renders, which lists don't load. */
export function MiniStepper({ steps }: { steps: ProjectState["steps"] }) {
  const generation = steps.filter(({ step }) => step !== "export");
  return (
    <span className="flex items-center gap-1" aria-label={generation.map((s) => `${s.step} : ${s.state}`).join(", ")}>
      {generation.map(({ step, state }) => (
        <span key={step} className={cn("h-1.5 w-5 rounded-full", DOTS[state])} />
      ))}
    </span>
  );
}
