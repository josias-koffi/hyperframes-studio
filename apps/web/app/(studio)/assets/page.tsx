import type { Metadata } from "next";
import { AssetDropzone } from "@/components/assets/asset-dropzone";
import { AssetGrid } from "@/components/assets/asset-grid";
import { FilterTabs } from "@/components/layout/filter-tabs";
import { PageHeader } from "@/components/layout/page-header";
import { PaginationNav } from "@/components/layout/pagination-nav";
import { SearchInput } from "@/components/layout/search-input";
import { SectionCard } from "@/components/layout/section-card";
import { type Asset } from "@/lib/api";
import { serverApi } from "@/lib/server-api";
import { ASSET_FILTERS } from "@/lib/assets";
import { listHref, matches, paginate, param } from "@/lib/listing";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Assets" };

const PAGE_SIZE = 24;

/** `?q=` searches file names and tags, `?kind=` keeps one family of files, `?page=` pages through them. */
export default async function AssetsLibraryPage({ searchParams }: PageProps<"/assets">) {
  const params = await searchParams;
  const query = param(params.q);
  const filter = ASSET_FILTERS.find((f) => f.value === param(params.kind) && f.kinds.length > 0);
  const assets = await serverApi<Asset[]>("/assets");
  const searched = assets.filter((asset) => matches(query, asset.filename, ...asset.tags));
  const filtered = filter ? searched.filter((asset) => filter.kinds.includes(asset.kind)) : searched;
  const { shown, page, pages } = paginate(filtered, params.page, PAGE_SIZE);
  const href = (next: { kind?: string; page?: number }) => listHref("/assets", { q: query, kind: filter?.value, ...next });

  return (
    <>
      <PageHeader
        title="Assets"
        description="Ta bibliothèque partagée : logos, polices, musiques, rushs. Ajoute-les ensuite à un projet depuis son onglet Assets."
      />
      <div className="flex flex-col gap-6 px-4 lg:px-6">
        <AssetDropzone />
        <SectionCard title={`Bibliothèque (${assets.length})`}>
          <div className="space-y-4">
            {assets.length > 0 && (
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <SearchInput placeholder="Rechercher un fichier…" className="w-full lg:max-w-sm" />
                <FilterTabs
                  label="Filtrer par type de fichier"
                  tabs={ASSET_FILTERS.map((f) => ({
                    label: f.label,
                    href: href({ kind: f.kinds.length ? f.value : undefined }),
                    active: (filter?.value ?? "all") === f.value,
                    count: f.kinds.length ? searched.filter((asset) => f.kinds.includes(asset.kind)).length : searched.length,
                  }))}
                />
                {pages > 1 && (
                  <p className="text-sm text-muted-foreground tabular-nums lg:ml-auto">
                    Page {page} sur {pages}
                  </p>
                )}
              </div>
            )}
            <AssetGrid
              assets={shown}
              filters={false}
              emptyText={assets.length === 0 ? "La bibliothèque est vide." : "Aucun fichier ne correspond à la recherche ou au filtre."}
            />
            <PaginationNav page={page} pages={pages} href={(target) => href({ page: target })} />
          </div>
        </SectionCard>
      </div>
    </>
  );
}
