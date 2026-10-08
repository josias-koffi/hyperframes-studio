import { Markdown } from "@/components/project/markdown";
import { StepPage } from "@/components/project/step-page";
import { Card, CardContent } from "@/components/ui/card";
import { serverFile } from "@/lib/server-api";
import { loadCreation } from "@/lib/creation-data";
import { stepReached } from "@/lib/creation-state";

export default async function BriefPage({ params }: PageProps<"/projects/[id]/creations/[creationId]/brief">) {
  const { creationId: id } = await params;
  const data = await loadCreation(id);
  const reached = stepReached(data.creation, data.state, "brief");
  const brief = reached ? await serverFile(id, "BRIEF.md") : null;

  return (
    <StepPage data={data} step="brief" reached={reached}>
      <Card className="shadow-surface">
        <CardContent>
          {brief ? <Markdown source={brief} /> : <p className="text-sm text-muted-foreground">BRIEF.md est introuvable dans le dossier de la création.</p>}
        </CardContent>
      </Card>
    </StepPage>
  );
}
