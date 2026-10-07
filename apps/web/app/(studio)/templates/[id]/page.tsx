import { ArrowLeftIcon, ExternalLinkIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CrumbLabel } from "@/components/layout/crumb-label";
import { PageHeader } from "@/components/layout/page-header";
import { SectionCard } from "@/components/layout/section-card";
import { RendersPanel } from "@/components/studio/renders-panel";
import { TemplateForm } from "@/components/studio/template-form";
import { Button } from "@/components/ui/button";
import { serverApi, type Job, type Project, type Render, type Template } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/templates/[id]">): Promise<Metadata> {
  const { id } = await params;
  return { title: (await serverApi<Template>(`/templates/${id}`)).name };
}

/** A template on its own: its form, and only the videos it produced (never the source project's exports). */
export default async function TemplatePage({ params }: PageProps<"/templates/[id]">) {
  const { id } = await params;
  const [template, renders, jobs] = await Promise.all([
    serverApi<Template>(`/templates/${id}`),
    serverApi<Render[]>(`/templates/${id}/renders`),
    serverApi<Job[]>(`/templates/${id}/jobs`),
  ]);
  const source = await serverApi<Project>(`/projects/${template.projectId}`).catch(() => null);
  const lastJob = jobs[0] ?? null;
  const rendering = lastJob?.status === "queued" || lastJob?.status === "running";

  return (
    <>
      <CrumbLabel label={template.name} />
      <PageHeader
        title={template.name}
        description={template.description ?? "Remplis les variables, la vidéo est rendue directement, sans Claude."}
        actions={
          <>
            <Button asChild variant="ghost">
              <Link href="/templates">
                <ArrowLeftIcon />
                Tous les templates
              </Link>
            </Button>
            {source && (
              <Button asChild variant="outline">
                <Link href={`/projects/${source.id}`}>
                  Projet source : {source.name}
                  <ExternalLinkIcon className="opacity-60" />
                </Link>
              </Button>
            )}
          </>
        }
      />
      <div className="grid gap-6 px-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:px-6">
        <SectionCard title="Variables" description={`${template.variables.length} champ${template.variables.length > 1 ? "s" : ""} à remplir`} className="self-start">
          <TemplateForm template={template} disabled={rendering} />
        </SectionCard>
        <RendersPanel projectId={template.projectId} renders={renders} lastRenderJob={lastJob} hideActions />
      </div>
    </>
  );
}
