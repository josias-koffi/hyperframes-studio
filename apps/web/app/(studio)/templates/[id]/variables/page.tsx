import { TriangleAlertIcon } from "lucide-react";
import type { Metadata } from "next";
import { Markdown } from "@/components/project/markdown";
import { StepPage } from "@/components/project/step-page";
import { VariablesEditor, type EditorMode } from "@/components/template/variables-editor";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { serverApi, type ProjectVariables } from "@/lib/api";
import { loadProject } from "@/lib/project-data";
import { stepJob, stepReached } from "@/lib/project-state";

export const metadata: Metadata = { title: "Variables" };

function gapText(diff: NonNullable<ProjectVariables["diff"]>): string[] {
  return [
    diff.missing.length > 0 && `pas déclarées par la vidéo : ${diff.missing.join(", ")}`,
    diff.extra.length > 0 && `déclarées mais pas validées : ${diff.extra.join(", ")}`,
    diff.changed.length > 0 && `type différent : ${diff.changed.join(", ")}`,
  ].filter((line): line is string => Boolean(line));
}

/**
 * The template's variable contract. Claude proposes it after the brief; the user edits and validates it here,
 * and can change it again once the template is built (Claude then updates the composition).
 */
export default async function VariablesPage({ params }: PageProps<"/templates/[id]/variables">) {
  const { id } = await params;
  const data = await loadProject(id);
  const { project, state, jobs } = data;
  const reached = stepReached(project, state, "variables");
  const variables = reached ? await serverApi<ProjectVariables>(`/projects/${id}/variables`) : null;
  const job = stepJob(jobs, "variables");

  const mode: EditorMode =
    state.phase === "running"
      ? "locked"
      : project.currentStep === "variables" && state.phase === "review"
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
        {gap.length > 0 && project.currentStep === "build" && state.phase !== "running" && (
          <Alert>
            <TriangleAlertIcon />
            <AlertTitle>La vidéo ne suit pas exactement cette liste</AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-4">
                {gap.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              Demande une modification sur le build, ou enregistre la liste pour que Claude mette la vidéo à jour.
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
        <VariablesEditor key={`${job?.id}-${mode}`} projectId={id} initial={list} mode={mode} />
      </div>
    </StepPage>
  );
}
