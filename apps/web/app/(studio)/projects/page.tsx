import { ClapperboardIcon, PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { ProjectsTable } from "@/components/studio/projects-table";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { loadOverview } from "@/lib/overview";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Projets" };

export default async function ProjectsPage() {
  const projects = await loadOverview("oneshot");

  return (
    <>
      <PageHeader
        title="Projets"
        description="Chaque projet est une vidéo unique : de son brief jusqu'aux exports. Les vidéos réutilisables sont dans Templates."
        actions={
          <Button asChild>
            <Link href="/projects/new">
              <PlusIcon />
              Nouvelle vidéo
            </Link>
          </Button>
        }
      />
      <div className="px-4 lg:px-6">
        {projects.length === 0 ? (
          <Empty className="border bg-card shadow-surface">
            <EmptyHeader>
              <EmptyMedia variant="icon" className="bg-primary/10 text-primary">
                <ClapperboardIcon />
              </EmptyMedia>
              <EmptyTitle>Aucun projet pour l&apos;instant</EmptyTitle>
              <EmptyDescription>Crée ta première vidéo : un brief suffit, Claude s&apos;occupe du reste.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button asChild>
                <Link href="/projects/new">Créer une vidéo</Link>
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <ProjectsTable projects={projects} />
        )}
      </div>
    </>
  );
}
