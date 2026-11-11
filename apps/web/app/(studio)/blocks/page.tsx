import { BLOCK_FAMILIES, DEFAULT_BLOCK_FAMILY, type BlockManifest, type BlockPropType } from "@studio/shared/browser";
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

/** A family's blocks in the order a video uses them: the hook first, the call to action last. */
const ROLE_ORDER = ["hook", "title", "bullet", "list", "stat", "quote", "sting", "cta"];
const roleIndex = (id: string) => {
  const index = ROLE_ORDER.findIndex((role) => id.includes(role));
  return index === -1 ? ROLE_ORDER.length : index;
};

/** The blocks by family, the default family first; the blocks of no family go with every family, last. */
function sections(cards: BlockCard[]): { key: string; title: string; description: string; cards: BlockCard[] }[] {
  const ids = [...new Set(cards.map((card) => card.manifest.family).filter((family): family is string => !!family))].sort(
    (a, b) => Number(b === DEFAULT_BLOCK_FAMILY) - Number(a === DEFAULT_BLOCK_FAMILY) || a.localeCompare(b),
  );
  const families = ids.map((id) => ({
    key: id,
    title: `Famille ${BLOCK_FAMILIES[id]?.name ?? id}`,
    description: BLOCK_FAMILIES[id]?.description ?? "",
    cards: cards.filter((card) => card.manifest.family === id).sort((a, b) => roleIndex(a.manifest.id) - roleIndex(b.manifest.id)),
  }));
  const shared = cards.filter((card) => !card.manifest.family);
  return shared.length
    ? [...families, { key: "shared", title: "Pour toutes les familles", description: "Médias, appareils, comparaisons et calques : ils se combinent avec n'importe quelle famille.", cards: shared }]
    : families;
}

export default async function BlocksPage() {
  const cards = await serverApi<BlockCard[]>("/blocks");

  return (
    <>
      <PageHeader
        title="Blocs"
        description="Les scènes prêtes à l'emploi du moteur blocs. Le modèle les choisit et remplit leurs champs : voici à quoi elles ressemblent, avec leur exemple."
      />
      <div className="flex flex-col gap-10 pb-8">
        {sections(cards).map((section) => (
          <section key={section.key} className="flex flex-col gap-4">
            <div className="px-4 lg:px-6">
              <h2 className="text-lg font-semibold">{section.title}</h2>
              {section.description && <p className="text-sm text-muted-foreground">{section.description}</p>}
            </div>
            <div className="grid gap-4 px-4 sm:grid-cols-2 lg:grid-cols-3 lg:px-6 xl:grid-cols-4 2xl:grid-cols-5">
              {section.cards.map(({ manifest, preview }) => (
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
          </section>
        ))}
      </div>
    </>
  );
}
