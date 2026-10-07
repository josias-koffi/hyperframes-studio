import type { Metadata } from "next";
import { AssetDropzone } from "@/components/assets/asset-dropzone";
import { AssetGrid } from "@/components/assets/asset-grid";
import { PageHeader } from "@/components/layout/page-header";
import { SectionCard } from "@/components/layout/section-card";
import { serverApi, type Asset } from "@/lib/api";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Assets" };

export default async function AssetsLibraryPage() {
  const assets = await serverApi<Asset[]>("/assets");

  return (
    <>
      <PageHeader
        title="Assets"
        description="Ta bibliothèque partagée : logos, polices, musiques, rushs. Ajoute-les ensuite à un projet depuis son onglet Assets."
      />
      <div className="flex flex-col gap-6 px-4 lg:px-6">
        <AssetDropzone />
        <SectionCard title={`Bibliothèque (${assets.length})`}>
          <AssetGrid assets={assets} emptyText="La bibliothèque est vide." />
        </SectionCard>
      </div>
    </>
  );
}
