import { CREATION_TYPES } from "@studio/shared/browser";
import { FolderKanbanIcon, LayoutTemplateIcon, PlusIcon, SearchXIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { FilterTabs } from "@/components/layout/filter-tabs";
import { PageHeader } from "@/components/layout/page-header";
import { PaginationNav } from "@/components/layout/pagination-nav";
import { ParamSelect } from "@/components/layout/param-select";
import { SearchInput } from "@/components/layout/search-input";
import { CreationCard } from "@/components/studio/creation-card";
import { CREATION_TYPE_META } from "@/components/studio/labels";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { listHref, matches, paginate, param } from "@/lib/listing";
import { loadCreations } from "@/lib/overview";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Templates" };

const PAGE_SIZE = 12;

/** `?q=` searches name and project, `?project=` and `?type=` narrow the list, `?page=` pages through it. */
export default async function TemplatesPage({ searchParams }: PageProps<"/templates">) {
  const params = await searchParams;
  const query = param(params.q);
  const templates = await loadCreations({ kind: "template" });
  const projects = [...new Map(templates.map((t) => [t.projectId, t.projectName])).entries()].sort((a, b) => a[1].localeCompare(b[1], "fr"));
  const project = projects.some(([id]) => id === param(params.project)) ? param(params.project) : undefined;
  const type = CREATION_TYPES.find((value) => value === param(params.type));

  // Type counts follow the search and the project, so each tab says what clicking it would show.
  const searched = templates.filter((t) => (!project || t.projectId === project) && matches(query, t.name, t.projectName));
  const filtered = type ? searched.filter((t) => t.type === type) : searched;
  const { shown, page, pages } = paginate(filtered, params.page, PAGE_SIZE);
  const href = (next: { type?: string; page?: number }) => listHref("/templates", { q: query, project, type, ...next });

  return (
    <>
      <PageHeader
        title="Templates"
        description="Les créations réutilisables de tous les projets (vidéos, carrousels, images) : leurs variables sont validées avant la composition, puis chaque itération se génère sans Claude."
        actions={
          <Button asChild>
            <Link href={project ? `/creations/new?kind=template&project=${project}` : "/creations/new?kind=template"}>
              <PlusIcon />
              Nouveau template
            </Link>
          </Button>
        }
      />
      <div className="px-4 lg:px-6">
        {templates.length === 0 ? (
          <Empty className="border bg-card shadow-surface">
            <EmptyHeader>
              <EmptyMedia variant="icon" className="bg-primary/10 text-primary">
                <LayoutTemplateIcon />
              </EmptyMedia>
              <EmptyTitle>Aucun template</EmptyTitle>
              <EmptyDescription>
                Un template se crée comme toute création, avec l&apos;option « Template réutilisable ». Après le brief, Claude
                propose les variables (textes, couleurs, images) : tu les valides, puis tu génères autant d&apos;itérations
                que tu veux.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button asChild>
                <Link href="/creations/new?kind=template">Créer un template</Link>
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <SearchInput placeholder="Rechercher un template…" className="w-full lg:max-w-sm" />
              <ParamSelect
                name="project"
                label="Filtrer par projet"
                allLabel="Tous les projets"
                icon={<FolderKanbanIcon className="text-muted-foreground" />}
                options={projects.map(([id, name]) => ({ value: id, label: name, count: templates.filter((t) => t.projectId === id).length }))}
                className="w-full lg:w-64"
              />
              <p className="text-sm text-muted-foreground tabular-nums lg:ml-auto">
                {filtered.length === templates.length
                  ? `${templates.length} template${templates.length > 1 ? "s" : ""}`
                  : `${filtered.length} sur ${templates.length}`}
                {pages > 1 && ` · page ${page} sur ${pages}`}
              </p>
            </div>
            <FilterTabs
              label="Filtrer par type"
              tabs={[
                { label: "Tous", href: href({ type: undefined }), active: !type, count: searched.length },
                ...CREATION_TYPES.map((t) => ({
                  label: CREATION_TYPE_META[t].plural,
                  href: href({ type: t }),
                  active: type === t,
                  count: searched.filter((item) => item.type === t).length,
                  icon: CREATION_TYPE_META[t].icon,
                })),
              ]}
            />
            {shown.length === 0 ? (
              <Empty className="border bg-card shadow-surface">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <SearchXIcon />
                  </EmptyMedia>
                  <EmptyTitle>Aucun template ne correspond</EmptyTitle>
                  <EmptyDescription>Change la recherche ou retire un filtre.</EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button asChild variant="outline">
                    <Link href="/templates">Tout afficher</Link>
                  </Button>
                </EmptyContent>
              </Empty>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {shown.map((template, index) => (
                  <CreationCard key={template.id} creation={template} index={index} showProject={!project} />
                ))}
              </div>
            )}
            <PaginationNav page={page} pages={pages} href={(target) => href({ page: target })} />
          </div>
        )}
      </div>
    </>
  );
}
