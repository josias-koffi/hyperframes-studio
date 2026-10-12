import { StepPage } from "@/components/project/step-page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadCreation } from "@/lib/creation-data";
import { stepJob, stepReached } from "@/lib/creation-state";

const CAPTION = {
  video: "Une image au milieu de chaque frame.",
  realistic: "Une image au milieu de chaque scène, plans générés compris.",
  carousel: "Une capture par slide, telle qu'elle sera exportée.",
  image: "La capture de l'image, telle qu'elle sera exportée.",
} as const;

/**
 * The composition itself cannot be framed here: index.html needs the HyperFrames runtime that `preview` and
 * `render` inject. The build is reviewed on its snapshots, and edited in the Studio HyperFrames.
 */
export default async function BuildPage({ params }: PageProps<"/projects/[id]/creations/[creationId]/build">) {
  const { creationId: id } = await params;
  const data = await loadCreation(id);
  const reached = stepReached(data.creation, data.state, "build");
  const version = stepJob(data.jobs, "build")?.id;

  return (
    <StepPage data={data} step="build" reached={reached}>
      <Card className="shadow-surface">
        <CardHeader>
          <CardTitle>Captures de la composition</CardTitle>
          <CardDescription>
            {CAPTION[data.creation.type]} Pour la retoucher, ouvre la composition dans le Studio HyperFrames (bouton en
            haut de la page).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* eslint-disable-next-line @next/next/no-img-element -- workspace file served by the API */}
          <img
            alt="Planche des captures du build"
            src={`/api/creations/${id}/files/snapshots/contact-sheet.jpg?v=${version}`}
            className="mx-auto max-h-[80vh] rounded-lg border"
          />
        </CardContent>
      </Card>
    </StepPage>
  );
}
