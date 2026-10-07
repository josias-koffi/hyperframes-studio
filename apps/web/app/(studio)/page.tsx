import { ArrowRightIcon, CheckCircle2Icon, ClapperboardIcon, EyeIcon, PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { PIPELINE, STEP_LABELS, workflowMeta } from "@/components/studio/labels";
import { MiniStepper, PhaseBadge } from "@/components/studio/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRelative } from "@/lib/format";
import { loadOverview, type ProjectOverview } from "@/lib/overview";
import type { PipelineStep } from "@/lib/project-state";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tableau de bord" };

const TODO_COPY: Partial<Record<ProjectOverview["state"]["phase"], { cta: string; text: (p: ProjectOverview) => string }>> = {
  review: { cta: "Relire", text: (p) => `${STEP_LABELS[p.currentStep]} prêt : à valider ou commenter.` },
  failed: { cta: "Voir l'erreur", text: (p) => `L'étape ${STEP_LABELS[p.currentStep].toLowerCase()} a échoué.` },
  running: { cta: "Suivre", text: (p) => `${PIPELINE[p.currentStep].doing}…` },
};

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <Card className="gap-1 py-4 shadow-surface">
      <CardHeader className="px-4">
        <CardDescription>{label}</CardDescription>
        <CardTitle className={cn("text-3xl font-semibold tabular-nums", tone)}>{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function ProjectCard({ project, index }: { project: ProjectOverview; index: number }) {
  const { icon: Icon, label } = workflowMeta(project.workflow);
  return (
    <Link href={`/projects/${project.id}`} className="group rise-in" style={{ "--stagger": index } as React.CSSProperties}>
      <Card className="h-full gap-4 py-4 shadow-surface transition-shadow group-hover:shadow-raised">
        <CardHeader className="px-4">
          <div className="flex items-start justify-between gap-2">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="size-4" />
            </span>
            <PhaseBadge phase={project.state.phase} />
          </div>
          <CardTitle className="mt-2 truncate group-hover:text-primary">{project.name}</CardTitle>
          <CardDescription>
            {label} · {formatRelative(project.updatedAt)}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4">
          <MiniStepper steps={project.state.steps} />
        </CardContent>
      </Card>
    </Link>
  );
}

const JOURNEY: PipelineStep[] = ["brief", "storyboard", "media", "build", "export"];

function Welcome() {
  return (
    <Card className="mx-4 overflow-hidden shadow-surface lg:mx-6">
      <CardContent className="grid gap-8 md:grid-cols-[1fr_1.4fr] md:items-center">
        <div className="space-y-4">
          <span className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-raised">
            <ClapperboardIcon className="size-6" />
          </span>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold tracking-tight">Ta première vidéo en cinq étapes</h2>
            <p className="text-sm text-muted-foreground">
              Tu décris la vidéo, Claude la prépare étape par étape. Tu n&apos;interviens qu&apos;aux deux points de
              validation : le storyboard et le build.
            </p>
          </div>
          <Button asChild size="lg">
            <Link href="/projects/new">
              <PlusIcon />
              Créer ma première vidéo
            </Link>
          </Button>
        </div>
        <ol className="space-y-3">
          {JOURNEY.map((step, index) => {
            const { icon: Icon, label, hint } = PIPELINE[step];
            const checkpoint = step === "storyboard" || step === "build";
            return (
              <li key={step} className="flex gap-3 rise-in" style={{ "--stagger": index } as React.CSSProperties}>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full border bg-muted text-muted-foreground">
                  <Icon className="size-4" />
                </span>
                <div>
                  <p className="flex items-center gap-2 text-sm font-medium">
                    {index + 1}. {label}
                    {checkpoint && (
                      <span className="flex items-center gap-1 text-xs font-normal text-warning">
                        <EyeIcon className="size-3" /> ta validation
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground">{hint}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}

export default async function DashboardPage() {
  const projects = await loadOverview();
  const todo = projects.filter((p) => p.state.phase in TODO_COPY);
  // Waiting on the user first, then failures, then what is running.
  const order = { review: 0, failed: 1, running: 2 } as Record<string, number>;
  todo.sort((a, b) => order[a.state.phase] - order[b.state.phase]);

  return (
    <>
      <PageHeader
        title="Tableau de bord"
        description="Ce qui t'attend, ce qui tourne, et tes dernières vidéos."
        actions={
          projects.length > 0 && (
            <Button asChild>
              <Link href="/projects/new">
                <PlusIcon />
                Nouvelle vidéo
              </Link>
            </Button>
          )
        }
      />

      {projects.length === 0 ? (
        <Welcome />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 px-4 md:grid-cols-4 lg:px-6">
            <Stat label="Projets" value={projects.length} />
            <Stat label="À valider" value={projects.filter((p) => p.state.phase === "review").length} tone="text-warning" />
            <Stat label="En génération" value={projects.filter((p) => p.state.phase === "running").length} tone="text-rec" />
            <Stat label="Vidéos prêtes" value={projects.filter((p) => p.state.phase === "done").length} tone="text-success" />
          </div>

          <section className="space-y-3 px-4 lg:px-6">
            <h2 className="text-sm font-medium text-muted-foreground">À faire</h2>
            {todo.length === 0 ? (
              <Card className="flex-row items-center gap-3 px-4 py-4 shadow-surface">
                <CheckCircle2Icon className="size-5 text-success" />
                <p className="text-sm">Rien ne t&apos;attend : tout est validé ou en pause.</p>
              </Card>
            ) : (
              <Card className="gap-0 divide-y py-0 shadow-surface">
                {todo.map((project) => {
                  const copy = TODO_COPY[project.state.phase]!;
                  return (
                    <div key={project.id} className="flex items-center gap-4 px-4 py-3">
                      <PhaseBadge phase={project.state.phase} className="w-28 justify-center" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{project.name}</p>
                        <p className="truncate text-sm text-muted-foreground">{copy.text(project)}</p>
                      </div>
                      <Button asChild size="sm" variant={project.state.phase === "review" ? "default" : "outline"}>
                        <Link href={`/projects/${project.id}`}>
                          {copy.cta}
                          <ArrowRightIcon />
                        </Link>
                      </Button>
                    </div>
                  );
                })}
              </Card>
            )}
          </section>

          <section className="space-y-3 px-4 lg:px-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-muted-foreground">Projets récents</h2>
              <Button asChild variant="link" size="sm" className="px-0">
                <Link href="/projects">Tous les projets</Link>
              </Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {projects.slice(0, 4).map((project, index) => (
                <ProjectCard key={project.id} project={project} index={index} />
              ))}
            </div>
          </section>
        </>
      )}
    </>
  );
}
