import { AssetDropzone } from "@/components/assets/asset-dropzone";
import { AssetGrid } from "@/components/assets/asset-grid";
import { SectionCard } from "@/components/layout/section-card";
import { CREATION_TYPE_META } from "@/components/studio/labels";
import { loadCreation } from "@/lib/creation-data";

/** What Claude gets in `assets/uploads/`: the campaign's files and the ones added for this création alone. */
export default async function CreationAssetsPage({ params }: PageProps<"/projects/[id]/creations/[creationId]/assets">) {
  const { creationId: id } = await params;
  const { creation, assets } = await loadCreation(id);
  const own = assets.filter((asset) => asset.creationId === id);
  const shared = assets.filter((asset) => asset.creationId === null);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Assets</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Les fichiers que Claude utilise pour {CREATION_TYPE_META[creation.type].noun}. Ils sont copiés dans{" "}
          <code className="rounded bg-muted px-1 font-mono text-xs">assets/uploads/</code> au prochain lancement
          d&apos;étape : ajoute-les avant le brief ou demande une modification ensuite.
        </p>
      </div>
      <AssetDropzone creationId={id} hint="Réservés à cette création : rush, musique, visuels spécifiques." />
      <SectionCard title={`Propres à cette création (${own.length})`}>
        <AssetGrid assets={own} emptyText="Aucun fichier propre à cette création." />
      </SectionCard>
      <SectionCard title={`Partagés par le projet ${creation.projectName} (${shared.length})`}>
        <AssetGrid assets={shared} emptyText="Le projet n'a pas encore d'assets partagés." />
      </SectionCard>
    </div>
  );
}
