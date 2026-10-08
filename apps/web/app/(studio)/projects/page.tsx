import { CircleDashedIcon, EyeIcon, FolderKanbanIcon, LayersIcon, LoaderIcon, type LucideIcon, SearchXIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { FilterTabs } from "@/components/layout/filter-tabs";
import { PageHeader } from "@/components/layout/page-header";
import { PaginationNav } from "@/components/layout/pagination-nav";
import { SearchInput } from "@/components/layout/search-input";
import { NewProjectButton } from "@/components/project/project-dialog";
import { ProjectCard } from "@/components/studio/creation-card";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { serverApi, type ProjectListItem } from "@/lib/api";
import { listHref, matches, paginate, param } from "@/lib/listing";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Projets" };

const PAGE_SIZE = 12;

/** Where a project stands, from what its créations wait on. */
const STATUSES: { value: string; label: string; icon: LucideIcon; test: (project: ProjectListItem) => boolean }[] = [
  { value: "review", label: "À valider", icon: EyeIcon, test: (project) => project.reviewCount > 0 },
  { value: "running", label: "En génération", icon: LoaderIcon, test: (project) => project.runningCount > 0 },
  { value: "templates", label: "Avec templates", icon: LayersIcon, test: (project) => project.templateCount > 0 },
  { value: "empty", label: "Vides", icon: CircleDashedIcon, test: (project) => Object.values(project.counts).every((count) => count === 0) },
];

/** `?q=` searches the name and the campaign context, `?status=` keeps the projects in one state, `?page=` pages through. */
export default async function ProjectsPage({ searchParams }: PageProps<"/projects">) {
  const params = await searchParams;
  const query = param(params.q);
  const status = STATUSES.find((s) => s.value === param(params.status));
  const projects = await serverApi<ProjectListItem[]>("/projects");
  // Status counts follow the search, so each tab says what clicking it would show.
  const searched = projects.filter((project) => matches(query, project.name, project.context));
  const found = status ? searched.filter(status.test) : searched;
  const { shown, page, pages } = paginate(found, params.page, PAGE_SIZE);
  const href = (next: { status?: string; page?: number }) => listHref("/projects", { q: query, status: status?.value, ...next });

  return (
    <>
      <PageHeader
        title="Projets"
        description="Un projet par campagne : il regroupe ses vidéos, carrousels et images, et leur donne un contexte commun."
        actions={<NewProjectButton />}
      />
      <div className="px-4 lg:px-6">
        {projects.length === 0 ? (
          <Empty className="border bg-card shadow-surface">
            <EmptyHeader>
              <EmptyMedia variant="icon" className="bg-primary/10 text-primary">
                <FolderKanbanIcon />
              </EmptyMedia>
              <EmptyTitle>Aucun projet pour l&apos;instant</EmptyTitle>
              <EmptyDescription>Crée un projet pour ta campagne, puis ajoutes-y des vidéos, des carrousels et des images.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <NewProjectButton label="Créer un projet" />
            </EmptyContent>
          </Empty>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <SearchInput placeholder="Rechercher un projet…" className="w-full sm:max-w-sm" />
              <p className="text-sm text-muted-foreground tabular-nums">
                {found.length !== projects.length
                  ? `${found.length} sur ${projects.length}`
                  : `${projects.length} projet${projects.length > 1 ? "s" : ""}`}
                {pages > 1 && ` · page ${page} sur ${pages}`}
              </p>
            </div>
            <FilterTabs
              label="Filtrer par état"
              tabs={[
                { label: "Tous", href: href({ status: undefined }), active: !status, count: searched.length },
                ...STATUSES.map((s) => ({ label: s.label, href: href({ status: s.value }), active: status === s, count: searched.filter(s.test).length, icon: s.icon })),
              ]}
            />
            {shown.length === 0 ? (
              <Empty className="border bg-card shadow-surface">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <SearchXIcon />
                  </EmptyMedia>
                  <EmptyTitle>Aucun projet ne correspond</EmptyTitle>
                  <EmptyDescription>
                    {query ? `Rien pour « ${query} » dans les noms ni dans les contextes de campagne` : "Aucun projet dans cet état"}
                    {query && status ? ` parmi les projets « ${status.label.toLowerCase()} ».` : "."}
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button asChild variant="outline">
                    <Link href="/projects">Tout afficher</Link>
                  </Button>
                </EmptyContent>
              </Empty>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {shown.map((project, index) => (
                  <ProjectCard key={project.id} project={project} index={index} />
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
