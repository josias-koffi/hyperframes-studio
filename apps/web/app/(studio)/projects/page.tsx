import { FolderKanbanIcon } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { NewProjectButton } from "@/components/project/project-dialog";
import { ProjectCard } from "@/components/studio/creation-card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { serverApi, type ProjectListItem } from "@/lib/api";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Projets" };

export default async function ProjectsPage() {
  const projects = await serverApi<ProjectListItem[]>("/projects");

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
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {projects.map((project, index) => (
              <ProjectCard key={project.id} project={project} index={index} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
