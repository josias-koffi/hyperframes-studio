"use client";

import { DownloadIcon, FilmIcon, ImageIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { SectionCard } from "@/components/layout/section-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { clientApi, type Job, type Render } from "@/lib/api";
import { formatDateTime, formatRelative } from "@/lib/format";
import { JobLog } from "./job-log";
import { StatusBadge } from "./status-badge";

const VIDEO_FORMATS = new Set(["mp4", "webm", "mov"]);

function RenderCard({ render }: { render: Render }) {
  const video = VIDEO_FORMATS.has(render.format);
  const [first] = render.urls;
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-surface">
      <div className="flex aspect-video items-center justify-center bg-muted">
        {first && video ? (
          <video src={first} controls preload="metadata" className="size-full bg-black object-contain" />
        ) : first ? (
          // eslint-disable-next-line @next/next/no-img-element -- render served from storage
          <img src={first} alt="Aperçu de l'export" className="size-full object-contain" />
        ) : (
          <FilmIcon className="size-8 text-muted-foreground" />
        )}
      </div>
      <div className="flex items-center gap-2 p-3">
        <Badge variant="secondary" className="font-mono uppercase">
          {video ? <FilmIcon /> : <ImageIcon />}
          {render.format}
        </Badge>
        <span className="flex-1 truncate text-xs text-muted-foreground" title={formatDateTime(render.createdAt)}>
          {formatRelative(render.createdAt)}
          {render.urls.length > 1 && ` · ${render.urls.length} fichiers`}
        </span>
        {render.urls.map((url, index) => (
          <Button key={url} asChild size="icon" variant="ghost" className="size-8">
            <a href={url} target="_blank" rel="noreferrer" download>
              <DownloadIcon />
              <span className="sr-only">Télécharger le fichier {index + 1}</span>
            </a>
          </Button>
        ))}
      </div>
    </div>
  );
}

export function RendersPanel({
  projectId,
  renders,
  lastRenderJob,
  hideActions,
}: {
  projectId: string;
  renders: Render[];
  lastRenderJob: Job | null;
  /** A template renders from its own form. */
  hideActions?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  // A finished render shows up in the grid; a running or failed one only exists as a job.
  const shownJob = lastRenderJob && lastRenderJob.status !== "succeeded" ? lastRenderJob : null;
  const rendering = shownJob?.status === "queued" || shownJob?.status === "running";

  async function render(body: unknown) {
    setPending(true);
    try {
      await clientApi(`/projects/${projectId}/renders`, { method: "POST", body: JSON.stringify(body) });
      toast.success("Rendu lancé");
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <SectionCard
      title="Fichiers rendus"
      description="Les fichiers rendus de la vidéo, prêts à télécharger ou publier."
      action={
        !hideActions && (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={pending || rendering} onClick={() => render({ format: "png", frames: 3 })}>
            <ImageIcon />
            Images de post
          </Button>
          <Button size="sm" disabled={pending || rendering} onClick={() => render({ format: "mp4" })}>
            <FilmIcon />
            Rendu MP4
          </Button>
        </div>
        )
      }
    >
      {shownJob && (
        <details className="group rounded-lg border p-3" open={shownJob.status === "failed"}>
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
            {rendering ? "Rendu en cours" : "Dernier rendu"}
            <StatusBadge status={shownJob.status} />
            <span className="ml-auto text-xs font-normal text-muted-foreground group-open:hidden">Afficher le journal</span>
          </summary>
          <JobLog key={shownJob.id} jobId={shownJob.id} onSettled={() => router.refresh()} className="mt-3 max-h-72" />
        </details>
      )}
      {renders.length === 0 && !rendering ? (
        <Empty className="border bg-muted/30">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FilmIcon />
            </EmptyMedia>
            <EmptyTitle>Aucun export</EmptyTitle>
            <EmptyDescription>
              {hideActions ? "Remplis les variables puis génère : les vidéos apparaîtront ici." : "Le MP4 est rendu automatiquement quand tu valides le build."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rendering && <div className="aspect-video rounded-xl border bg-muted live-shimmer" aria-label="Rendu en cours" />}
          {renders.map((r) => (
            <RenderCard key={r.id} render={r} />
          ))}
        </div>
      )}
    </SectionCard>
  );
}
