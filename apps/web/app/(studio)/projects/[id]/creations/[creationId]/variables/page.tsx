import { TriangleAlertIcon } from "lucide-react";
import type { Metadata } from "next";
import { Markdown } from "@/components/project/markdown";
import { StepPage } from "@/components/project/step-page";
import { VariablesEditor, type EditorMode } from "@/components/template/variables-editor";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type CreationVariables } from "@/lib/api";
import { serverApi } from "@/lib/server-api";
import { loadCreation } from "@/lib/creation-data";
import { stepJob, stepReached } from "@/lib/creation-state";

export const metadata: Metadata = { title: "Variables" };

function gapText(diff: NonNullable<CreationVariables["diff"]>): string[] {
  return [
    diff.missing.length > 0 && `pas déclarées par la composition : ${diff.missing.join(", ")}`,
    diff.extra.length > 0 && `déclarées mais pas validées : ${diff.extra.join(", ")}`,
    diff.changed.length > 0 && `type différent : ${diff.changed.join(", ")}`,
  ].filter((line): line is string => Boolean(line));
}

/**
 * The template's variable contract. Claude proposes it after the brief; the user edits and validates it here,
 * and can change it again once the template is built (Claude then updates the composition).
 */
export default async function VariablesPage({ params }: PageProps<"/projects/[id]/creations/[creationId]/variables">) {
  const { creationId: id } = await params;
  const data = await loadCreation(id);
  const { creation, state, jobs } = data;
  const reached = stepReached(creation, state, "variables");
  const variables = reached ? await serverApi<CreationVariables>(`/creations/${id}/variables`) : null;
  const job = stepJob(jobs, "variables");

  const mode: EditorMode =
    state.phase === "running"
      ? "locked"
      : creation.currentStep === "variables" && state.phase === "review"
        ? "review"
        : state.phase === "done"
          ? "built"
          : "locked";
  const list = variables?.proposed ?? variables?.declared ?? [];
  const gap = variables?.diff ? gapText(variables.diff) : [];

  return (
    <StepPage data={data} step="variables" reached={reached} reviewInContent>
      <div className="flex flex-col gap-6">
        {variables && variables.errors.length > 0 && (
          <Alert variant="destructive">
            <TriangleAlertIcon />
            <AlertTitle>Fichier de variables illisible</AlertTitle>
            <AlertDescription>{variables.errors.join(" ; ")}</AlertDescription>
          </Alert>
        )}
        {gap.length > 0 && creation.currentStep === "build" && state.phase !== "running" && (
          <Alert>
            <TriangleAlertIcon />
            <AlertTitle>La composition ne suit pas exactement cette liste</AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-4">
                {gap.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              Demande une modification sur le build, ou enregistre la liste pour que Claude mette la composition à jour.
            </AlertDescription>
          </Alert>
        )}
        {mode === "review" && job?.resultText && (
          <Card className="shadow-surface">
            <CardHeader>
              <CardTitle>Pourquoi ces variables</CardTitle>
              <CardDescription>Le résumé de Claude.</CardDescription>
            </CardHeader>
            <CardContent>
              <Markdown source={job.resultText} />
            </CardContent>
          </Card>
        )}
        {mode === "locked" && state.phase !== "running" && (
          <p className="text-sm text-muted-foreground">
            La liste est figée pendant la fabrication du template. Tu pourras la modifier une fois le build validé.
          </p>
        )}
        <VariablesEditor key={`${job?.id}-${mode}`} creationId={id} initial={list} mode={mode} />
      </div>
    </StepPage>
  );
}
