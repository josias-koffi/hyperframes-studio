import { AssetDropzone } from "@/components/assets/asset-dropzone";
import { AssetGrid } from "@/components/assets/asset-grid";
import { LibraryImport } from "@/components/assets/library-import";
import { CrumbLabel } from "@/components/layout/crumb-label";
import { PageHeader } from "@/components/layout/page-header";
import { SectionCard } from "@/components/layout/section-card";
import { serverApi, type Asset, type Project } from "@/lib/api";

export const dynamic = "force-dynamic";

/** The campaign's own library: every création of the project gets these files. */
export default async function ProjectAssetsPage({ params }: PageProps<"/projects/[id]/assets">) {
  const { id } = await params;
  const [project, assets] = await Promise.all([serverApi<Project>(`/projects/${id}`), serverApi<Asset[]>(`/assets?projectId=${id}`)]);
  const shared = assets.filter((asset) => asset.creationId === null);

  return (
    <>
      <CrumbLabel segment={id} label={project.name} />
      <PageHeader
        title="Assets du projet"
        description="Logos, images, polices, charte : partagés par toutes les créations du projet. Claude les retrouve dans assets/uploads/ de chaque création."
      />
      <div className="flex flex-col gap-6 px-4 lg:px-6">
        <AssetDropzone projectId={id} />
        <SectionCard title={`Fichiers partagés (${shared.length})`} action={<LibraryImport projectId={id} />}>
          <AssetGrid assets={shared} emptyText="Aucun fichier pour ce projet." />
        </SectionCard>
      </div>
    </>
  );
}
