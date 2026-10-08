import { CREATION_TYPES } from "@studio/shared/browser";
import { ArrowRightIcon, CheckCircle2Icon, EyeIcon, FolderKanbanIcon, LoaderIcon, type LucideIcon, PlusIcon, SparklesIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { NewProjectButton } from "@/components/project/project-dialog";
import { CoverMedia } from "@/components/studio/cover-media";
import { CreationCard, TypeCounts } from "@/components/studio/creation-card";
import { CREATION_TYPE_META, stepMeta } from "@/components/studio/labels";
import { PhaseBadge } from "@/components/studio/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { type ProjectListItem } from "@/lib/api";
import { serverApi } from "@/lib/server-api";
import { creationHref, projectHref } from "@/lib/creation-state";
import { formatRelative } from "@/lib/format";
import { loadCreations, type CreationOverview } from "@/lib/overview";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tableau de bord" };

const TODO_COPY: Partial<Record<CreationOverview["state"]["phase"], { cta: string; text: (c: CreationOverview) => string }>> = {
  review: { cta: "Relire", text: (c) => `${stepMeta(c.currentStep, c.type).label} prêt : à valider ou commenter.` },
  failed: { cta: "Voir l'erreur", text: (c) => `L'étape ${stepMeta(c.currentStep, c.type).label.toLowerCase()} a échoué.` },
  running: { cta: "Suivre", text: (c) => `${stepMeta(c.currentStep, c.type).doing}…` },
};

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

/** The hour decides the greeting; the server's clock is close enough for a hello. */
function greeting() {
  const hour = Number(new Intl.DateTimeFormat("fr-FR", { hour: "numeric", hour12: false, timeZone: "Europe/Paris" }).format(new Date()));
  return hour < 5 || hour >= 18 ? "Bonsoir" : "Bonjour";
}

/** One sentence on what needs the user, the headline of the dashboard. */
function headline(review: number, failed: number, running: number) {
  if (review > 0) return `${review} création${review > 1 ? "s t'attendent" : " t'attend"} pour validation.`;
  if (failed > 0) return `${failed} étape${failed > 1 ? "s ont" : " a"} échoué : un coup d'œil s'impose.`;
  if (running > 0) return `Claude travaille sur ${running} création${running > 1 ? "s" : ""}.`;
  return "Tout est à jour. Que crée-t-on aujourd'hui ?";
}

/** Big entry point: say hello, say what waits, and start a video, a carousel or an image in one click. */
function Hero({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <section className="mx-4 rise-in overflow-hidden rounded-2xl border bg-card shadow-surface lg:mx-6">
      <div className="relative grid gap-6 p-6 md:p-8 xl:grid-cols-[1fr_auto] xl:items-center">
        <div aria-hidden className="pointer-events-none absolute -top-24 -left-16 size-72 rounded-full bg-primary/25 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -right-10 -bottom-32 size-72 rounded-full bg-rec/10 blur-3xl" />
        <div className="relative space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-primary uppercase">
            <SparklesIcon className="size-3.5" />
            Tableau de bord
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="text-muted-foreground">{subtitle}</p>
        </div>
        <div className="relative grid grid-cols-3 gap-3">
          {CREATION_TYPES.map((type) => {
            const { icon: Icon, label } = CREATION_TYPE_META[type];
            return (
              <Link
                key={type}
                href={`/creations/new?type=${type}`}
                className="group flex min-w-28 flex-col items-center gap-2 rounded-xl border bg-background/60 px-4 py-4 text-center backdrop-blur transition-all hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-raised"
              >
                <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <Icon className="size-5" />
                </span>
                <span className="text-sm font-medium">{label}</span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground group-hover:text-primary">
                  <PlusIcon className="size-3" />
                  Créer
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value, icon: Icon, tone, href }: { label: string; value: number; icon: LucideIcon; tone: string; href: string }) {
  return (
    <Link href={href} className="group">
      <Card className="flex-row items-center gap-4 px-4 py-4 shadow-surface transition-shadow group-hover:shadow-raised">
        <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", tone)}>
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-2xl leading-none font-semibold tabular-nums">{value}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">{label}</p>
        </div>
      </Card>
    </Link>
  );
}

const TODO_ACCENT: Record<string, string> = { review: "bg-warning", failed: "bg-destructive", running: "bg-rec" };

function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-base font-semibold tracking-tight">{children}</h2>
      {action}
    </div>
  );
}

export default async function DashboardPage() {
  const [projects, creations] = await Promise.all([serverApi<ProjectListItem[]>("/projects"), loadCreations()]);
  const todo = creations.filter((c) => c.state.phase in TODO_COPY);
  // Waiting on the user first, then failures, then what is running.
  const order = { review: 0, failed: 1, running: 2 } as Record<string, number>;
  todo.sort((a, b) => order[a.state.phase] - order[b.state.phase]);
  const count = (phase: CreationOverview["state"]["phase"]) => creations.filter((c) => c.state.phase === phase).length;

  if (projects.length === 0) {
    return (
      <>
        <PageHeader title="Tableau de bord" description="Ce qui t'attend, ce qui tourne, et tes dernières créations." />
        <Welcome />
      </>
    );
  }

  return (
    <>
      <Hero title={`${greeting()} 👋`} subtitle={headline(count("review"), count("failed"), count("running"))} />

      <div className="grid grid-cols-2 gap-4 px-4 xl:grid-cols-4 lg:px-6">
        <Stat label="Projets" value={projects.length} icon={FolderKanbanIcon} tone="bg-primary/10 text-primary" href="/projects" />
        <Stat label="À valider" value={count("review")} icon={EyeIcon} tone="bg-warning/15 text-warning" href="/projects?status=review" />
        <Stat label="En génération" value={count("running")} icon={LoaderIcon} tone="bg-rec/15 text-rec" href="/projects?status=running" />
        <Stat label="Créations prêtes" value={count("done")} icon={CheckCircle2Icon} tone="bg-success/15 text-success" href="/projects" />
      </div>

      <div className="grid items-start gap-6 px-4 lg:px-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="space-y-3">
          <SectionTitle>À faire</SectionTitle>
          {todo.length === 0 ? (
            <Card className="flex-row items-center gap-4 px-5 py-6 shadow-surface">
              <span className="flex size-10 items-center justify-center rounded-full bg-success/15 text-success">
                <CheckCircle2Icon className="size-5" />
              </span>
              <div>
                <p className="font-medium">Rien ne t&apos;attend</p>
                <p className="text-sm text-muted-foreground">Tout est validé ou en pause.</p>
              </div>
            </Card>
          ) : (
            <ul className="space-y-2">
              {todo.map((creation, index) => {
                const copy = TODO_COPY[creation.state.phase]!;
                const { icon: Icon } = CREATION_TYPE_META[creation.type];
                return (
                  <li key={creation.id} className="rise-in" style={{ "--stagger": index } as React.CSSProperties}>
                    <Link
                      href={creationHref(creation)}
                      className="group relative flex items-center gap-4 overflow-hidden rounded-xl border bg-card py-3 pr-4 pl-5 shadow-surface transition-shadow hover:shadow-raised"
                    >
                      <span className={cn("absolute inset-y-0 left-0 w-1", TODO_ACCENT[creation.state.phase])} />
                      <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
                        {creation.cover ? <CoverMedia cover={creation.cover} /> : <Icon className="size-5 text-muted-foreground" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium group-hover:text-primary">{creation.name}</p>
                        <p className="truncate text-sm text-muted-foreground">{copy.text(creation)}</p>
                        <p className="truncate text-xs text-muted-foreground">{creation.projectName}</p>
                      </div>
                      <PhaseBadge phase={creation.state.phase} className="hidden sm:inline-flex" />
                      <span
                        className={cn(
                          buttonVariants({ size: "sm", variant: creation.state.phase === "review" ? "default" : "outline" }),
                          "pointer-events-none",
                        )}
                      >
                        {copy.cta}
                        <ArrowRightIcon />
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <SectionTitle
            action={
              <Button asChild variant="link" size="sm" className="px-0">
                <Link href="/projects">Tous les projets</Link>
              </Button>
            }
          >
            Projets actifs
          </SectionTitle>
          <Card className="gap-0 divide-y py-0 shadow-surface">
            {projects.slice(0, 5).map((project) => (
              <Link key={project.id} href={projectHref(project.id)} className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/50">
                <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
                  {project.covers[0] ? (
                    <CoverMedia cover={project.covers[0]} className="[&>span]:hidden" />
                  ) : (
                    <FolderKanbanIcon className="size-4 text-muted-foreground" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium group-hover:text-primary">{project.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{formatRelative(project.activityAt)}</p>
                </div>
                {project.reviewCount > 0 && (
                  <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning tabular-nums">{project.reviewCount} à valider</span>
                )}
                <TypeCounts counts={project.counts} className="hidden 2xl:flex" />
                <ArrowRightIcon className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            ))}
          </Card>
        </section>
      </div>

      <section className="space-y-3 px-4 lg:px-6">
        <SectionTitle
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/creations/new">
                <PlusIcon />
                Nouvelle création
              </Link>
            </Button>
          }
        >
          Créations récentes
        </SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {creations.slice(0, 8).map((creation, index) => (
            <CreationCard key={creation.id} creation={creation} index={index} showProject />
          ))}
        </div>
      </section>
    </>
  );
}
