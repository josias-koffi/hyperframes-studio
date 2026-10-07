import { AssetDropzone } from "@/components/assets/asset-dropzone";
import { AssetGrid } from "@/components/assets/asset-grid";
import { LibraryImport } from "@/components/assets/library-import";
import { SectionCard } from "@/components/layout/section-card";
import { loadProject } from "@/lib/project-data";

export default async function ProjectAssetsPage({ params }: PageProps<"/projects/[id]/assets">) {
  const { id } = await params;
  const { assets } = await loadProject(id);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Assets du projet</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Logos, images, rushs, musiques que Claude doit utiliser. Ils sont copiés dans{" "}
          <code className="rounded bg-muted px-1 font-mono text-xs">assets/uploads/</code> de la vidéo au prochain lancement
          d&apos;étape : ajoute-les avant le brief ou demande une modification ensuite.
        </p>
      </div>
      <AssetDropzone projectId={id} />
      <SectionCard title={`Fichiers (${assets.length})`} action={<LibraryImport projectId={id} />}>
        <AssetGrid assets={assets} emptyText="Aucun fichier pour ce projet." />
      </SectionCard>
    </div>
  );
}
