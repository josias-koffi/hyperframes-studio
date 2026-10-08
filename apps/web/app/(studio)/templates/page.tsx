import { LayoutTemplateIcon, PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { ProjectsTable } from "@/components/studio/projects-table";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { loadOverview } from "@/lib/overview";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Templates" };

export default async function TemplatesPage() {
  const templates = await loadOverview("template");

  return (
    <>
      <PageHeader
        title="Templates"
        description="Des vidéos réutilisables : leurs variables sont validées avant le storyboard, puis chaque itération se génère sans Claude."
        actions={
          <Button asChild>
            <Link href="/templates/new">
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
                Un template se crée comme une vidéo, avec l&apos;option « Template réutilisable ». Après le brief, Claude
                propose les variables (textes, couleurs, images) : tu les valides, puis tu génères autant d&apos;itérations
                que tu veux.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button asChild>
                <Link href="/templates/new">Créer un template</Link>
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <ProjectsTable projects={templates} kind="template" />
        )}
      </div>
    </>
  );
}
