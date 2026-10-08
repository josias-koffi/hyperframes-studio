import { CREATION_TYPES } from "@studio/shared/browser";
import { ArrowRightIcon, CheckCircle2Icon, EyeIcon, PlusIcon, SparklesIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { NewProjectButton } from "@/components/project/project-dialog";
import { CreationCard } from "@/components/studio/creation-card";
import { CREATION_TYPE_META, stepMeta } from "@/components/studio/labels";
import { PhaseBadge } from "@/components/studio/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { serverApi, type ProjectListItem } from "@/lib/api";
import { creationHref } from "@/lib/creation-state";
import { loadCreations, type CreationOverview } from "@/lib/overview";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tableau de bord" };

const TODO_COPY: Partial<Record<CreationOverview["state"]["phase"], { cta: string; text: (c: CreationOverview) => string }>> = {
  review: { cta: "Relire", text: (c) => `${stepMeta(c.currentStep, c.type).label} prêt : à valider ou commenter.` },
  failed: { cta: "Voir l'erreur", text: (c) => `L'étape ${stepMeta(c.currentStep, c.type).label.toLowerCase()} a échoué.` },
  running: { cta: "Suivre", text: (c) => `${stepMeta(c.currentStep, c.type).doing}…` },
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

function Welcome() {
  return (
    <Card className="mx-4 overflow-hidden shadow-surface lg:mx-6">
      <CardContent className="grid gap-8 md:grid-cols-[1fr_1.4fr] md:items-center">
        <div className="space-y-4">
          <span className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-raised">
            <SparklesIcon className="size-6" />
          </span>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold tracking-tight">Une campagne, tous ses formats</h2>
            <p className="text-sm text-muted-foreground">
              Crée un projet pour ta campagne, puis ajoutes-y ce dont tu as besoin. Claude prépare chaque création étape par
              étape ; tu valides le plan et le résultat.
            </p>
          </div>
          <NewProjectButton size="lg" label="Créer mon premier projet" />
        </div>
        <ul className="space-y-3">
          {CREATION_TYPES.map((type, index) => {
            const { icon: Icon, label, description } = CREATION_TYPE_META[type];
            return (
              <li key={type} className="flex gap-3 rise-in" style={{ "--stagger": index } as React.CSSProperties}>
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
                  <Icon className="size-4" />
                </span>
                <div>
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-sm text-muted-foreground">{description}</p>
                </div>
              </li>
            );
          })}
          <li className="flex gap-3 rise-in" style={{ "--stagger": 3 } as React.CSSProperties}>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted text-warning">
              <EyeIcon className="size-4" />
            </span>
            <div>
              <p className="text-sm font-medium">En template, si tu veux la décliner</p>
              <p className="text-sm text-muted-foreground">Tu valides ses variables, puis chaque version se génère sans Claude.</p>
            </div>
          </li>
        </ul>
      </CardContent>
    </Card>
  );
}

export default async function DashboardPage() {
  const [projects, creations] = await Promise.all([serverApi<ProjectListItem[]>("/projects"), loadCreations()]);
  const todo = creations.filter((c) => c.state.phase in TODO_COPY);
  // Waiting on the user first, then failures, then what is running.
  const order = { review: 0, failed: 1, running: 2 } as Record<string, number>;
  todo.sort((a, b) => order[a.state.phase] - order[b.state.phase]);

  return (
    <>
      <PageHeader
        title="Tableau de bord"
        description="Ce qui t'attend, ce qui tourne, et tes dernières créations."
        actions={
          projects.length > 0 && (
            <Button asChild>
              <Link href="/creations/new">
                <PlusIcon />
                Nouvelle création
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
            <Stat label="À valider" value={creations.filter((c) => c.state.phase === "review").length} tone="text-warning" />
            <Stat label="En génération" value={creations.filter((c) => c.state.phase === "running").length} tone="text-rec" />
            <Stat label="Créations prêtes" value={creations.filter((c) => c.state.phase === "done").length} tone="text-success" />
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
                {todo.map((creation) => {
                  const copy = TODO_COPY[creation.state.phase]!;
                  const { icon: Icon } = CREATION_TYPE_META[creation.type];
                  return (
                    <div key={creation.id} className="flex items-center gap-4 px-4 py-3">
                      <PhaseBadge phase={creation.state.phase} className="w-28 justify-center" />
                      <Icon className="size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">
                          {creation.name} <span className="font-normal text-muted-foreground">· {creation.projectName}</span>
                        </p>
                        <p className="truncate text-sm text-muted-foreground">{copy.text(creation)}</p>
                      </div>
                      <Button asChild size="sm" variant={creation.state.phase === "review" ? "default" : "outline"}>
                        <Link href={creationHref(creation)}>
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
              <h2 className="text-sm font-medium text-muted-foreground">Créations récentes</h2>
              <Button asChild variant="link" size="sm" className="px-0">
                <Link href="/projects">Tous les projets</Link>
              </Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {creations.slice(0, 8).map((creation, index) => (
                <CreationCard key={creation.id} creation={creation} index={index} showProject />
              ))}
            </div>
          </section>
        </>
      )}
    </>
  );
}
