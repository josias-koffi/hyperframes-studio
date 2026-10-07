import { StepPage } from "@/components/project/step-page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadProject } from "@/lib/project-data";
import { stepJob, stepReached } from "@/lib/project-state";

/**
 * The composition itself cannot be framed here: index.html needs the HyperFrames runtime that `preview` and
 * `render` inject. The build is reviewed on its snapshots, and edited in the Studio HyperFrames.
 */
export default async function BuildPage({ params }: PageProps<"/projects/[id]/build">) {
  const { id } = await params;
  const data = await loadProject(id);
  const reached = stepReached(data.project, data.state, "build");
  const version = stepJob(data.jobs, "build")?.id;

  return (
    <StepPage data={data} step="build" reached={reached}>
      <Card className="shadow-surface">
        <CardHeader>
          <CardTitle>Captures de la composition</CardTitle>
          <CardDescription>
            Une image au milieu de chaque frame. Pour la voir en mouvement ou la retoucher, utilise « Ouvrir dans le Studio
            HyperFrames » en haut de la page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* eslint-disable-next-line @next/next/no-img-element -- workspace file served by the API */}
          <img
            alt="Planche des captures du build"
            src={`/api/projects/${id}/files/snapshots/contact-sheet.jpg?v=${version}`}
            className="mx-auto max-h-[80vh] rounded-lg border"
          />
        </CardContent>
      </Card>
    </StepPage>
  );
}
