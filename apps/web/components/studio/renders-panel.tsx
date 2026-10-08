"use client";

import type { CompositionVariable, CreationType } from "@studio/shared/browser";
import { DownloadIcon, FileDownIcon, FilmIcon, GalleryHorizontalIcon, ImageIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { SectionCard } from "@/components/layout/section-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { clientApi, type Creation, type Job, type Render } from "@/lib/api";
import { renderFiles } from "@/lib/creation-state";
import { cn } from "@/lib/utils";
import { formatDateTime, formatRelative } from "@/lib/format";
import { ValueChip } from "@/components/template/variable-input";
import { JobLog } from "./job-log";
import { CREATION_TYPE_META } from "./labels";
import { StatusBadge } from "./status-badge";

/** The values an iteration render was made with, compared with the iteration's current ones. */
function RenderValues({ render, declarations, current }: { render: Render; declarations: CompositionVariable[]; current: Record<string, unknown> }) {
  const used = render.variables ?? {};
  const changed = declarations.filter((variable) => JSON.stringify(used[variable.id] ?? variable.default) !== JSON.stringify(current[variable.id] ?? variable.default));
  return (
    <details className="group border-t px-3 py-2 text-xs">
      <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
        <span className="text-muted-foreground">Valeurs utilisées</span>
        {changed.length === 0 ? (
          <Badge variant="secondary">identiques aux actuelles</Badge>
        ) : (
          <Badge variant="outline" className="border-warning/50 text-warning">
            {changed.length} différente{changed.length > 1 ? "s" : ""}
          </Badge>
        )}
      </summary>
      <dl className="mt-2 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1">
        {declarations.map((variable) => (
          <div key={variable.id} className="contents">
            <dt className={changed.includes(variable) ? "font-medium text-warning" : "text-muted-foreground"}>{variable.label}</dt>
            <dd className="min-w-0">
              <ValueChip variable={variable} value={used[variable.id] ?? variable.default} />
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

type RenderValuesProps = { declarations: CompositionVariable[]; current: Record<string, unknown> };

function RenderFooter({ render, children }: { render: Render; children?: React.ReactNode }) {
  const { images, pdf, video } = renderFiles(render);
  const label = video ? render.format : pdf ? `${images.length} slides + PDF` : images.length > 1 ? `${images.length} images` : "png";
  return (
    <div className="flex items-center gap-2 p-3">
      <Badge variant="secondary" className="font-mono uppercase">
        {video ? <FilmIcon /> : pdf ? <GalleryHorizontalIcon /> : <ImageIcon />}
        {label}
      </Badge>
      <span className="flex-1 truncate text-xs text-muted-foreground" title={formatDateTime(render.createdAt)}>
        {formatRelative(render.createdAt)}
      </span>
      {children}
    </div>
  );
}

function DownloadButton({ url, label, children }: { url: string; label: string; children?: React.ReactNode }) {
  return (
    <Button asChild size={children ? "sm" : "icon"} variant={children ? "outline" : "ghost"} className={children ? undefined : "size-8"}>
      <a href={url} target="_blank" rel="noreferrer" download>
        {children ? <FileDownIcon /> : <DownloadIcon />}
        {children ?? <span className="sr-only">{label}</span>}
      </a>
    </Button>
  );
}

/** A carousel render: every slide in order, each downloadable, and the PDF that assembles them. */
function CarouselCard({ render, values }: { render: Render; values?: RenderValuesProps }) {
  const { images, pdf } = renderFiles(render);
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-surface sm:col-span-2 xl:col-span-3">
      <div className="flex snap-x gap-3 overflow-x-auto bg-muted p-3">
        {images.map((image, index) => (
          <figure key={image.key} className="group relative w-44 shrink-0 snap-start sm:w-56">
            {/* eslint-disable-next-line @next/next/no-img-element -- render served from storage */}
            <img src={image.url} alt={`Slide ${index + 1}`} className="w-full rounded-lg border bg-background shadow-surface" />
            <figcaption className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
              Slide {index + 1}
              <DownloadButton url={image.url} label={`Télécharger la slide ${index + 1}`} />
            </figcaption>
          </figure>
        ))}
      </div>
      <RenderFooter render={render}>{pdf && <DownloadButton url={pdf.url} label="PDF">PDF</DownloadButton>}</RenderFooter>
      {values && <RenderValues render={render} declarations={values.declarations} current={values.current} />}
    </div>
  );
}

function RenderCard({ render, values }: { render: Render; values?: RenderValuesProps }) {
  const { images, video, pdf } = renderFiles(render);
  if (pdf) return <CarouselCard render={render} values={values} />;
  const first = video ?? images[0];
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-surface">
      <div className={cn("flex items-center justify-center bg-muted", video ? "aspect-video" : "aspect-[4/5]")}>
        {video ? (
          <video src={video.url} controls preload="metadata" className="size-full bg-black object-contain" />
        ) : first ? (
          // eslint-disable-next-line @next/next/no-img-element -- render served from storage
          <img src={first.url} alt="Aperçu de l'export" className="size-full object-contain" />
        ) : (
          <FilmIcon className="size-8 text-muted-foreground" />
        )}
      </div>
      <RenderFooter render={render}>
        {render.urls.map((url, index) => (
          <DownloadButton key={url} url={url} label={`Télécharger le fichier ${index + 1}`} />
        ))}
      </RenderFooter>
      {values && <RenderValues render={render} declarations={values.declarations} current={values.current} />}
    </div>
  );
}

/** What a création can render on demand, beside its deliverable. */
const ACTIONS: Record<CreationType, { label: string; icon: typeof FilmIcon; body: Record<string, unknown>; primary?: boolean }[]> = {
  video: [
    { label: "Images de post", icon: ImageIcon, body: { format: "png", frames: 3 } },
    { label: "Rendu MP4", icon: FilmIcon, body: { format: "mp4" }, primary: true },
  ],
  carousel: [{ label: "Régénérer slides et PDF", icon: GalleryHorizontalIcon, body: { format: "pdf" }, primary: true }],
  image: [{ label: "Régénérer le PNG", icon: ImageIcon, body: { format: "png" }, primary: true }],
};

const EMPTY_TEXT: Record<CreationType, string> = {
  video: "Le MP4 est rendu automatiquement quand tu valides le build.",
  carousel: "Les slides et le PDF sont générés automatiquement quand tu valides le build.",
  image: "Le PNG est généré automatiquement quand tu valides le build.",
};

export function RendersPanel({
  creation,
  renders,
  lastRenderJob,
  hideActions,
  values,
}: {
  creation: Pick<Creation, "id" | "type">;
  renders: Render[];
  lastRenderJob: Job | null;
  /** An iteration renders from its own form. */
  hideActions?: boolean;
  /** An iteration's renders show the values each one was made with. */
  values?: RenderValuesProps;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  // A finished render shows up in the grid; a running or failed one only exists as a job.
  const shownJob = lastRenderJob && lastRenderJob.status !== "succeeded" ? lastRenderJob : null;
  const rendering = shownJob?.status === "queued" || shownJob?.status === "running";

  async function render(body: unknown) {
    setPending(true);
    try {
      await clientApi(`/creations/${creation.id}/renders`, { method: "POST", body: JSON.stringify(body) });
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
      description={`Les fichiers de ${CREATION_TYPE_META[creation.type].noun}, prêts à télécharger ou publier.`}
      action={
        !hideActions && (
          <div className="flex gap-2">
            {ACTIONS[creation.type].map((action) => (
              <Button key={action.label} size="sm" variant={action.primary ? "default" : "outline"} disabled={pending || rendering} onClick={() => render(action.body)}>
                <action.icon />
                {action.label}
              </Button>
            ))}
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
              {hideActions ? "Remplis les valeurs puis génère : les rendus de cette itération apparaîtront ici." : EMPTY_TEXT[creation.type]}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rendering && <div className="aspect-video rounded-xl border bg-muted live-shimmer" aria-label="Rendu en cours" />}
          {renders.map((r) => (
            <RenderCard key={r.id} render={r} values={values} />
          ))}
        </div>
      )}
    </SectionCard>
  );
}
