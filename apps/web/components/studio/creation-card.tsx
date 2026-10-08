import { aspectOf, CREATION_TYPES, type CreationType } from "@studio/shared/browser";
import { LayersIcon } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProjectListItem } from "@/lib/api";
import { creationHref, projectHref } from "@/lib/creation-state";
import { formatRelative } from "@/lib/format";
import type { CreationOverview } from "@/lib/overview";
import { cn } from "@/lib/utils";
import { CREATION_TYPE_META, formatSummary } from "./labels";
import { MiniStepper, PhaseBadge } from "./status-badge";

/** The cover keeps the création's own ratio, so a story, a post and a banner read as what they are. */
function Cover({ creation }: { creation: CreationOverview }) {
  const { icon: Icon } = CREATION_TYPE_META[creation.type];
  const aspect = aspectOf(creation.width, creation.height) ?? "16:9";
  const ratio = { "9:16": "aspect-[9/16] h-full", "4:5": "aspect-[4/5] h-full", "1:1": "aspect-square h-full", "16:9": "aspect-video w-full" }[aspect];
  return (
    <div className="flex h-40 items-center justify-center overflow-hidden bg-muted/60 p-3">
      <div className={cn("flex max-h-full max-w-full items-center justify-center overflow-hidden rounded-md border bg-card shadow-surface", ratio)}>
        {creation.cover ? (
          // eslint-disable-next-line @next/next/no-img-element -- render served from storage
          <img src={creation.cover} alt="" className="size-full object-cover" />
        ) : (
          <Icon className="size-6 text-muted-foreground/60" />
        )}
      </div>
    </div>
  );
}

export function CreationCard({ creation, index = 0, showProject }: { creation: CreationOverview; index?: number; showProject?: boolean }) {
  return (
    <Link href={creationHref(creation)} className="group rise-in" style={{ "--stagger": index } as React.CSSProperties}>
      <Card className="h-full gap-0 overflow-hidden py-0 shadow-surface transition-shadow group-hover:shadow-raised">
        <Cover creation={creation} />
        <CardHeader className="gap-1 border-t px-4 pt-3">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">{formatSummary(creation)}</span>
            {creation.kind === "template" && (
              <Badge variant="secondary" className="gap-1">
                <LayersIcon className="size-3" />
                Template
              </Badge>
            )}
          </div>
          <CardTitle className="truncate group-hover:text-primary">{creation.name}</CardTitle>
          <CardDescription className="truncate">
            {showProject ? `${creation.projectName} · ` : ""}
            {formatRelative(creation.updatedAt)}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-2 px-4 pt-2 pb-4">
          <MiniStepper steps={creation.state.steps} />
          <PhaseBadge phase={creation.state.phase} type={creation.type} />
        </CardContent>
      </Card>
    </Link>
  );
}

/** "2 vidéos · 1 carrousel · 3 images" as chips, one icon per type. */
export function TypeCounts({ counts, className }: { counts: Record<CreationType, number>; className?: string }) {
  const present = CREATION_TYPES.filter((type) => counts[type] > 0);
  if (present.length === 0) return <span className={cn("text-xs text-muted-foreground", className)}>Aucune création</span>;
  return (
    <span className={cn("flex flex-wrap gap-1.5", className)}>
      {present.map((type) => {
        const { icon: Icon, label, plural } = CREATION_TYPE_META[type];
        return (
          <Badge key={type} variant="outline" className="gap-1 font-normal">
            <Icon className="size-3" />
            {counts[type]} {(counts[type] > 1 ? plural : label).toLowerCase()}
          </Badge>
        );
      })}
    </span>
  );
}

export function ProjectCard({ project, index = 0 }: { project: ProjectListItem; index?: number }) {
  return (
    <Link href={projectHref(project.id)} className="group rise-in" style={{ "--stagger": index } as React.CSSProperties}>
      <Card className="h-full gap-0 overflow-hidden py-0 shadow-surface transition-shadow group-hover:shadow-raised">
        <div className="grid h-32 grid-cols-3 grid-rows-1 gap-1 bg-muted/60 p-2">
          {[0, 1, 2].map((slot) =>
            project.covers[slot] ? (
              // eslint-disable-next-line @next/next/no-img-element -- render served from storage
              <img key={slot} src={project.covers[slot]} alt="" className="size-full min-h-0 rounded-md border object-cover" />
            ) : (
              <span key={slot} className="rounded-md border border-dashed bg-card/50" />
            ),
          )}
        </div>
        <CardHeader className="gap-1 border-t px-4 pt-3">
          <CardTitle className="truncate group-hover:text-primary">{project.name}</CardTitle>
          <CardDescription className="line-clamp-2 min-h-10">{project.context || "Pas de contexte de campagne."}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 px-4 pt-3 pb-4">
          <TypeCounts counts={project.counts} />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{formatRelative(project.activityAt)}</span>
            <span className="flex gap-2">
              {project.runningCount > 0 && <span className="text-rec">{project.runningCount} en cours</span>}
              {project.reviewCount > 0 && <span className="font-medium text-warning">{project.reviewCount} à valider</span>}
              {project.templateCount > 0 && <span>{project.templateCount} template{project.templateCount > 1 ? "s" : ""}</span>}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
