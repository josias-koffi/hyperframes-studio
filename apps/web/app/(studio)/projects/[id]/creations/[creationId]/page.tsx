import { ArrowRightIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { StepAction } from "@/components/project/step-action";
import { CREATION_TYPE_META, formatSummary, stepMeta, workflowMeta } from "@/components/studio/labels";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type Creation } from "@/lib/api";
import { serverApi } from "@/lib/server-api";
import { formatRelative } from "@/lib/format";
import { loadCreation } from "@/lib/creation-data";
import { creationHref, STEP_SEGMENTS, stepJob, type StepState } from "@/lib/creation-state";
import { cn } from "@/lib/utils";

export async function generateMetadata({ params }: PageProps<"/projects/[id]/creations/[creationId]">): Promise<Metadata> {
  const { creationId: id } = await params;
  return { title: (await serverApi<Creation>(`/creations/${id}`)).name };
}

const BRIEF_FIELDS: { key: string; label: string }[] = [
  { key: "message", label: "Message clé" },
  { key: "audience", label: "Audience" },
  { key: "footage", label: "Vidéo source" },
  { key: "backgrounds", label: "Images de fond" },
  { key: "notes", label: "Notes" },
];

const STATE_TEXT: Record<StepState, { label: string; tone: string }> = {
  done: { label: "Terminé", tone: "text-success" },
  current: { label: "À lancer", tone: "text-primary" },
  running: { label: "En cours", tone: "text-rec" },
  review: { label: "À valider", tone: "text-warning" },
  failed: { label: "Échec", tone: "text-destructive" },
  todo: { label: "À venir", tone: "text-muted-foreground" },
};

/** A brief field as text: a string, or a list of file names (`backgrounds`). */
function briefText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.filter((item) => typeof item === "string").join(", ");
  return "";
}

/** Variables the user listed in the wizard (`brief.variables`), for Claude's proposal. */
function suggestedVariables(brief: Record<string, unknown>): { label: string }[] {
  const list = brief.variables;
  if (!Array.isArray(list)) return [];
  return list.filter((item): item is { label: string } => typeof item?.label === "string" && item.label.trim() !== "");
}

export default async function CreationOverviewPage({ params }: PageProps<"/projects/[id]/creations/[creationId]">) {
  const { creationId: id } = await params;
  const { creation, state, jobs, renders, iterations } = await loadCreation(id);
  const base = creationHref(creation);
  const suggested = suggestedVariables(creation.brief);
  const fields = BRIEF_FIELDS.map(({ key, label }) => ({ key, label, value: briefText(creation.brief[key]) })).filter(({ value }) => value);

  return (
    <div className="flex flex-col gap-6">
      <StepAction creation={creation} state={state} stepHref={`${base}/${STEP_SEGMENTS[creation.currentStep]}`} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="shadow-surface">
          <CardHeader>
            <CardTitle>Ta demande</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Format</dt>
                <dd>
                  {formatSummary(creation)}
                  {creation.kind === "template" && " · template réutilisable"}
                </dd>
              </div>
              {creation.type === "video" && (
                <div>
                  <dt className="text-xs text-muted-foreground">Type de vidéo</dt>
                  <dd>{workflowMeta(creation.workflow).label}</dd>
                </div>
              )}
              {fields.map(({ key, label, value }) => (
                <div key={key}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="whitespace-pre-wrap">{value}</dd>
                </div>
              ))}
              {suggested.length > 0 && (
                <div>
                  <dt className="text-xs text-muted-foreground">Variables suggérées</dt>
                  <dd>{suggested.map((variable) => variable.label).join(", ")}</dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>

        <Card className="gap-0 py-0 shadow-surface">
          <CardHeader className="py-4">
            <CardTitle>Avancement</CardTitle>
          </CardHeader>
          <ul className="divide-y border-t">
            {state.steps.map(({ step, state: stepState }) => {
              const { label, icon: Icon } = stepMeta(step, creation.type);
              const job = step === "export" || step === "iterations" ? null : stepJob(jobs, step);
              const when = step === "export" ? renders[0]?.createdAt : step === "iterations" ? iterations[0]?.updatedAt : job?.createdAt;
              return (
                <li key={step}>
                  <Link href={`${base}/${STEP_SEGMENTS[step]}`} className="group flex items-center gap-3 px-6 py-3 hover:bg-accent/50">
                    <Icon className="size-4 text-muted-foreground" />
                    <span className="flex-1 text-sm font-medium">{label}</span>
                    <span className={cn("text-xs", STATE_TEXT[stepState].tone)}>{STATE_TEXT[stepState].label}</span>
                    <span className="hidden w-28 text-right text-xs text-muted-foreground sm:block">{when ? formatRelative(when) : ""}</span>
                    <ArrowRightIcon className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </Link>
                </li>
              );
            })}
          </ul>
          {renders.length > 0 && (
            <div className="border-t p-4">
              <Button asChild variant="outline" size="sm">
                <Link href={`${base}/exports`}>
                  {renders.length} export{renders.length > 1 ? "s" : ""} de {CREATION_TYPE_META[creation.type].noun}
                  <ArrowRightIcon />
                </Link>
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
