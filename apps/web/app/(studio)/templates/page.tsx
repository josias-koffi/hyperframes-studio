import { ArrowRightIcon, LayoutTemplateIcon, VariableIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { serverApi, type Template } from "@/lib/api";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Templates" };

export default async function TemplatesPage() {
  const templates = await serverApi<Template[]>("/templates");

  return (
    <>
      <PageHeader title="Templates" description="Des vidéos réutilisables : change textes et couleurs, le rendu part sans Claude." />
      <div className="px-4 lg:px-6">
        {templates.length === 0 ? (
          <Empty className="border bg-card shadow-surface">
            <EmptyHeader>
              <EmptyMedia variant="icon" className="bg-primary/10 text-primary">
                <LayoutTemplateIcon />
              </EmptyMedia>
              <EmptyTitle>Aucun template</EmptyTitle>
              <EmptyDescription>
                Un template est une vidéo terminée dont la composition déclare des variables. Pendant le build, demande à
                Claude d&apos;exposer les textes ou couleurs à changer, puis clique « Enregistrer comme template » sur le
                projet.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button asChild variant="outline">
                <Link href="/projects">Voir mes projets</Link>
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {templates.map((template, index) => (
              <Card key={template.id} className="rise-in shadow-surface" style={{ "--stagger": index } as React.CSSProperties}>
                <CardHeader>
                  <CardTitle>{template.name}</CardTitle>
                  <CardDescription>{template.description ?? "Sans description."}</CardDescription>
                  <CardAction>
                    <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <LayoutTemplateIcon className="size-4" />
                    </span>
                  </CardAction>
                </CardHeader>
                <CardFooter className="mt-auto justify-between gap-2">
                  <Badge variant="secondary">
                    <VariableIcon />
                    {template.variables.length} variable{template.variables.length > 1 ? "s" : ""}
                  </Badge>
                  <div className="flex gap-2">
                    <Button asChild size="sm" variant="ghost">
                      <Link href={`/projects/${template.projectId}`}>Projet source</Link>
                    </Button>
                    <Button asChild size="sm">
                      <Link href={`/templates/${template.id}`}>
                        Utiliser
                        <ArrowRightIcon />
                      </Link>
                    </Button>
                  </div>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
