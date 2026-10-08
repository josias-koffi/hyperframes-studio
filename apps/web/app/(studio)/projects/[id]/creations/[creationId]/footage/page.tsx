import { Markdown } from "@/components/project/markdown";
import { StepPage } from "@/components/project/step-page";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { serverFile } from "@/lib/server-api";
import { loadCreation } from "@/lib/creation-data";
import { stepJob, stepReached } from "@/lib/creation-state";
import { parseFootageMap } from "@/lib/footage-map";

const seconds = (value: number) => `${value.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} s`;

export default async function FootagePage({ params }: PageProps<"/projects/[id]/creations/[creationId]/footage">) {
  const { creationId: id } = await params;
  const data = await loadCreation(id);
  const reached = stepReached(data.creation, data.state, "footage");
  const [notes, map] = reached
    ? await Promise.all([serverFile(id, "FOOTAGE.md"), serverFile(id, "footage_map.json").then(parseFootageMap)])
    : [null, null];
  const version = stepJob(data.jobs, "footage")?.id;

  return (
    <StepPage data={data} step="footage" reached={reached}>
      <Tabs defaultValue={notes || !map?.sheets.length ? "notes" : "sheets"}>
        <TabsList>
          <TabsTrigger value="notes">Repères</TabsTrigger>
          {map && map.sheets.length > 0 && <TabsTrigger value="sheets">Planches</TabsTrigger>}
        </TabsList>
        <TabsContent value="notes">
          {notes ? (
            <Card className="shadow-surface">
              <CardContent>
                <Markdown source={notes} />
              </CardContent>
            </Card>
          ) : (
            <Empty className="border bg-card shadow-surface">
              <EmptyHeader>
                <EmptyTitle>Pas de repères</EmptyTitle>
                <EmptyDescription>
                  Claude n&apos;a pas produit <code className="font-mono">FOOTAGE.md</code> à cette étape. Lis son
                  journal ci-dessous, puis demande une modification pour qu&apos;il l&apos;écrive.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </TabsContent>
        {map && map.sheets.length > 0 && (
          <TabsContent value="sheets" className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              {map.duration !== null && `Rush de ${seconds(map.duration)}, `}
              {map.shots} plan{map.shots > 1 ? "s" : ""} détecté{map.shots > 1 ? "s" : ""}. Chaque planche se lit
              ligne par ligne, de gauche à droite : ce sont les images que Claude a analysées.
            </p>
            {map.sheets.map((sheet) => (
              <figure key={sheet.path} className="flex max-w-4xl flex-col gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- workspace file proxied by the API */}
                <img
                  src={`/api/creations/${id}/files/${sheet.path}?v=${version}`}
                  alt={`Images du rush de ${seconds(sheet.start)} à ${seconds(sheet.end)}`}
                  className="w-full rounded-xl border bg-black shadow-surface"
                  loading="lazy"
                />
                <figcaption className="text-sm text-muted-foreground">
                  {sheet.refined ? "Zoom" : "Planche"} : {seconds(sheet.start)} → {seconds(sheet.end)}
                </figcaption>
              </figure>
            ))}
          </TabsContent>
        )}
      </Tabs>
    </StepPage>
  );
}
