import { CREATION_KINDS, CREATION_TYPES } from "@studio/shared/browser";
import type { Metadata } from "next";
import { NewCreationForm } from "@/components/creation/new-creation-form";
import { PageHeader } from "@/components/layout/page-header";
import { serverApi, type ProjectListItem } from "@/lib/api";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nouvelle création" };

/** `?project=` files the création under a project, `?type=` and `?kind=` preselect what it is. */
export default async function NewCreationPage({ searchParams }: PageProps<"/creations/new">) {
  const query = await searchParams;
  const projects = await serverApi<ProjectListItem[]>("/projects");
  const project = projects.find((p) => p.id === query.project);
  const type = CREATION_TYPES.find((value) => value === query.type);
  const kind = CREATION_KINDS.find((value) => value === query.kind);

  return (
    <>
      <PageHeader
        title={project ? `Nouvelle création · ${project.name}` : "Nouvelle création"}
        description="Une vidéo, un carrousel ou une image : décris-la, Claude rédige le brief et prépare le plan, que tu valides avant la composition."
      />
      <div className="mx-auto w-full max-w-4xl px-4 lg:px-6">
        <NewCreationForm
          projects={projects.map(({ id, name }) => ({ id, name }))}
          initialProjectId={project?.id}
          initialType={type}
          initialKind={kind}
        />
      </div>
    </>
  );
}
