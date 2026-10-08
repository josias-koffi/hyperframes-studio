import { Markdown } from "@/components/project/markdown";
import { StepPage } from "@/components/project/step-page";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { serverFile } from "@/lib/api";
import { loadCreation } from "@/lib/creation-data";
import { stepJob, stepReached } from "@/lib/creation-state";

export default async function StoryboardPage({ params }: PageProps<"/projects/[id]/creations/[creationId]/storyboard">) {
  const { creationId: id } = await params;
  const data = await loadCreation(id);
  const reached = stepReached(data.creation, data.state, "storyboard");
  const [board, script] = reached
    ? await Promise.all([
        serverFile(id, "storyboard.html"),
        serverFile(id, "SCRIPT.md").then((text) => text ?? serverFile(id, "STORYBOARD.md")),
      ])
    : [null, null];
  const version = stepJob(data.jobs, "storyboard")?.id;

  return (
    <StepPage data={data} step="storyboard" reached={reached}>
      <Tabs defaultValue={board || !script ? "board" : "script"}>
        <TabsList>
          <TabsTrigger value="board">{data.creation.type === "carousel" ? "Slides" : "Planche"}</TabsTrigger>
          {script && <TabsTrigger value="script">{data.creation.type === "carousel" ? "Plan détaillé" : "Script"}</TabsTrigger>}
        </TabsList>
        <TabsContent value="board">
          {board ? (
            <iframe
              title="Storyboard"
              src={`/api/creations/${id}/files/storyboard.html?v=${version}`}
              className="h-[75vh] min-h-[32rem] w-full rounded-xl border bg-white shadow-surface"
              sandbox="allow-scripts"
            />
          ) : (
            <Empty className="border bg-card shadow-surface">
              <EmptyHeader>
                <EmptyTitle>Pas de planche</EmptyTitle>
                <EmptyDescription>
                  Claude n&apos;a pas produit <code className="font-mono">storyboard.html</code> à
                  cette étape. Lis son journal ci-dessous, puis demande une modification pour
                  qu&apos;il la génère.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </TabsContent>
        {script && (
          <TabsContent value="script">
            <Card className="shadow-surface">
              <CardContent>
                <Markdown source={script} />
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </StepPage>
  );
}
