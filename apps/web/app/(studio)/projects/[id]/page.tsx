import { CREATION_TYPES, type CreationType } from "@studio/shared/browser";
import { FolderOpenIcon, PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CrumbLabel } from "@/components/layout/crumb-label";
import { ProjectActions } from "@/components/project/project-dialog";
import { CreationCard, TypeCounts } from "@/components/studio/creation-card";
import { CREATION_TYPE_META } from "@/components/studio/labels";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { serverApi, type Project } from "@/lib/api";
import { projectHref } from "@/lib/creation-state";
import { loadCreations } from "@/lib/overview";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/projects/[id]">): Promise<Metadata> {
  const { id } = await params;
  return { title: (await serverApi<Project>(`/projects/${id}`)).name };
}

/** A campaign: its context, and its créations sorted by type. */
export default async function ProjectPage({ params, searchParams }: PageProps<"/projects/[id]">) {
  const { id } = await params;
  const { type: rawType } = await searchParams;
  const type = CREATION_TYPES.find((value) => value === rawType);
  const [project, creations] = await Promise.all([serverApi<Project>(`/projects/${id}`).catch(() => notFound()), loadCreations({ projectId: id })]);
  const counts = Object.fromEntries(CREATION_TYPES.map((t) => [t, creations.filter((c) => c.type === t).length])) as Record<CreationType, number>;
  const shown = type ? creations.filter((creation) => creation.type === type) : creations;
  const newHref = `/creations/new?project=${id}${type ? `&type=${type}` : ""}`;
  const tabs: { value: CreationType | undefined; label: string; count: number }[] = [
    { value: undefined, label: "Toutes", count: creations.length },
    ...CREATION_TYPES.map((t) => ({ value: t, label: CREATION_TYPE_META[t].plural, count: counts[t] })),
  ];

  return (
    <>
      <CrumbLabel segment={id} label={project.name} />
      <div className="flex rise-in flex-col gap-4 px-4 md:flex-row md:items-start md:justify-between lg:px-6">
        <div className="min-w-0 space-y-2">
          <p className="text-xs font-medium tracking-wide text-primary uppercase">Projet</p>
          <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
          <TypeCounts counts={counts} />
          {project.context && <p className="max-w-3xl text-sm whitespace-pre-wrap text-muted-foreground">{project.context}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button variant="outline" asChild>
            <Link href={projectHref(id, "assets")}>
              <FolderOpenIcon />
              Assets du projet
            </Link>
          </Button>
          <Button asChild>
            <Link href={newHref}>
              <PlusIcon />
              Nouvelle création
            </Link>
          </Button>
          <ProjectActions project={project} />
        </div>
      </div>

      <nav aria-label="Filtrer par type" className="flex gap-1 overflow-x-auto px-4 lg:px-6">
        {tabs.map((tab) => {
          const Icon = tab.value ? CREATION_TYPE_META[tab.value].icon : null;
          return (
            <Link
              key={tab.label}
              href={tab.value ? `${projectHref(id)}?type=${tab.value}` : projectHref(id)}
              aria-current={tab.value === type ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors hover:bg-accent",
                tab.value === type ? "border-primary bg-accent font-medium" : "bg-card",
              )}
            >
              {Icon && <Icon className="size-4 text-muted-foreground" />}
              {tab.label}
              <span className="rounded-md bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">{tab.count}</span>
            </Link>
          );
        })}
      </nav>

      <div className="px-4 lg:px-6">
        {shown.length === 0 ? (
          <Empty className="border bg-card shadow-surface">
            <EmptyHeader>
              <EmptyMedia variant="icon" className="bg-primary/10 text-primary">
                {(() => {
                  const Icon = CREATION_TYPE_META[type ?? "video"].icon;
                  return <Icon />;
                })()}
              </EmptyMedia>
              <EmptyTitle>{type ? `Aucun${type === "image" ? "e" : ""} ${CREATION_TYPE_META[type].label.toLowerCase()} dans ce projet` : "Projet vide"}</EmptyTitle>
              <EmptyDescription>
                Décris ce que tu veux : Claude rédige le brief, prépare le plan et compose. Tu valides à chaque étape clé.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button asChild>
                <Link href={newHref}>
                  <PlusIcon />
                  Nouvelle création
                </Link>
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {shown.map((creation, index) => (
              <CreationCard key={creation.id} creation={creation} index={index} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
