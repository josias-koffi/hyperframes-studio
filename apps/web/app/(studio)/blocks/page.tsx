import type { BlockManifest, BlockPropType } from "@studio/shared/browser";
import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { serverApi } from "@/lib/server-api";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Blocs" };

type BlockCard = { manifest: BlockManifest; preview: string };

const PROP_TYPES: Record<BlockPropType, string> = {
  text: "texte",
  color: "couleur",
  image: "image",
  video: "vidéo",
  enum: "choix",
};

export default async function BlocksPage() {
  const cards = await serverApi<BlockCard[]>("/blocks");

  return (
    <>
      <PageHeader
        title="Blocs"
        description="Les scènes prêtes à l'emploi du moteur blocs. Le modèle les choisit et remplit leurs champs : voici à quoi elles ressemblent, avec leur exemple."
      />
      <div className="grid gap-4 px-4 sm:grid-cols-2 lg:grid-cols-3 lg:px-6 xl:grid-cols-4 2xl:grid-cols-5">
        {cards.map(({ manifest, preview }) => (
          <Card key={manifest.id} className="overflow-hidden pt-0">
            <iframe
              title={`Aperçu du bloc ${manifest.name}`}
              srcDoc={preview}
              sandbox="allow-scripts"
              loading="lazy"
              className="aspect-[9/16] w-full border-b bg-zinc-900"
            />
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                {manifest.name}
                {manifest.kind === "overlay" && <Badge variant="secondary">Calque</Badge>}
              </CardTitle>
              <CardDescription>{manifest.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <p>
                <span className="font-medium">Quand l&apos;utiliser : </span>
                <span className="text-muted-foreground">{manifest.useWhen}</span>
              </p>
              <p className="text-muted-foreground">
                {manifest.duration.min} à {manifest.duration.max} s · {manifest.aspects?.join(", ") ?? "tous formats"}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(manifest.props).map(([key, prop]) => (
                  <Badge key={key} variant="outline" title={prop.label}>
                    {key} · {PROP_TYPES[prop.type]}
                  </Badge>
                ))}
              </div>
              <code className="text-xs text-muted-foreground">{manifest.id}</code>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
