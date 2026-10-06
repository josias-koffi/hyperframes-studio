import Link from "next/link";
import { NewProjectDialog } from "@/components/studio/new-project-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { serverApi, type Project } from "@/lib/api";
import { STEP_LABELS } from "@/components/studio/labels";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const projects = await serverApi<Project[]>("/projects");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Projets</h1>
        <NewProjectDialog />
      </div>
      {projects.length === 0 ? (
        <p className="text-muted-foreground">Aucun projet pour l&apos;instant. Crée le premier pour lancer une vidéo.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Link key={project.id} href={`/projects/${project.id}`}>
              <Card className="transition-colors hover:bg-muted/50">
                <CardHeader>
                  <CardTitle>{project.name}</CardTitle>
                  <CardDescription className="flex items-center gap-2">
                    <span className="font-mono text-xs">videos/{project.slug}</span>
                    <Badge variant="secondary">{STEP_LABELS[project.currentStep]}</Badge>
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
