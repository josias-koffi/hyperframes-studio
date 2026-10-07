import { Markdown } from "@/components/project/markdown";
import { StepPage } from "@/components/project/step-page";
import { Card, CardContent } from "@/components/ui/card";
import { serverFile } from "@/lib/api";
import { loadProject } from "@/lib/project-data";
import { stepReached } from "@/lib/project-state";

export default async function BriefPage({ params }: PageProps<"/projects/[id]/brief">) {
  const { id } = await params;
  const data = await loadProject(id);
  const reached = stepReached(data.project, data.state, "brief");
  const brief = reached ? await serverFile(id, "BRIEF.md") : null;

  return (
    <StepPage data={data} step="brief" reached={reached}>
      <Card className="shadow-surface">
        <CardContent>
          {brief ? <Markdown source={brief} /> : <p className="text-sm text-muted-foreground">BRIEF.md est introuvable dans le dossier de la vidéo.</p>}
        </CardContent>
      </Card>
    </StepPage>
  );
}
