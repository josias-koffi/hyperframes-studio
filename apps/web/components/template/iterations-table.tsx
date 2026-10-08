"use client";

import type { CompositionVariable } from "@studio/shared/browser";
import { FilmIcon, GalleryHorizontalIcon, ImageIcon, PlusIcon, SearchIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { createDataTableColumnHelper, DataTable } from "@/components/data-table/data-table";
import { NameDialog } from "@/components/studio/entity-dialogs";
import { StatusBadge } from "@/components/studio/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Creation, IterationListItem } from "@/lib/api";
import { creationHref, renderFiles } from "@/lib/creation-state";
import { formatDateTime, formatRelative } from "@/lib/format";
import { createIteration, IterationActions } from "./iteration-actions";
import { ValueChip } from "./variable-input";

const columnHelper = createDataTableColumnHelper<IterationListItem>();

function Thumbnail({ iteration }: { iteration: IterationListItem }) {
  const files = iteration.lastRender ? renderFiles(iteration.lastRender) : null;
  const image = files?.images[0];
  return (
    <span className="flex aspect-video w-28 items-center justify-center overflow-hidden rounded-md border bg-muted">
      {files?.video ? (
        <video src={`${files.video.url}#t=0.5`} muted preload="metadata" className="size-full bg-black object-contain" />
      ) : image ? (
        // eslint-disable-next-line @next/next/no-img-element -- render served from storage
        <img src={image.url} alt="" className="size-full object-contain" />
      ) : (
        <FilmIcon className="size-5 text-muted-foreground" />
      )}
    </span>
  );
}

function buildColumns(declared: CompositionVariable[], base: string) {
  const byId = new Map(declared.map((variable) => [variable.id, variable]));
  return columnHelper.columns([
    columnHelper.display({ id: "preview", header: "Aperçu", cell: ({ row }) => <Thumbnail iteration={row.original} /> }),
    columnHelper.display({
      id: "name",
      header: "Itération",
      cell: ({ row }) => (
        <Link href={`${base}/${row.original.id}`} className="group block min-w-36" onClick={(e) => e.stopPropagation()}>
          <span className="font-medium group-hover:underline">{row.original.name}</span>
          <span className="block text-xs text-muted-foreground" title={formatDateTime(row.original.updatedAt)}>
            modifiée {formatRelative(row.original.updatedAt)}
          </span>
        </Link>
      ),
    }),
    columnHelper.display({
      id: "values",
      header: "Valeurs",
      cell: ({ row }) => {
        const entries = declared.map((variable) => [variable.id, row.original.values[variable.id] ?? variable.default] as const);
        return (
          <span className="flex max-w-md flex-wrap gap-1">
            {entries.slice(0, 4).map(([id, value]) => (
              <ValueChip key={id} variable={byId.get(id)} value={value} />
            ))}
            {entries.length > 4 && <span className="text-xs text-muted-foreground">+{entries.length - 4}</span>}
          </span>
        );
      },
    }),
    columnHelper.display({
      id: "render",
      header: "Dernier rendu",
      cell: ({ row }) => {
        const { lastJob, format } = row.original;
        return (
          <span className="flex flex-col items-start gap-1">
            <Badge variant="secondary" className="font-mono uppercase">
              {format === "pdf" ? <GalleryHorizontalIcon /> : format === "png" ? <ImageIcon /> : <FilmIcon />}
              {format}
            </Badge>
            {lastJob ? <StatusBadge status={lastJob.status} /> : <span className="text-xs text-muted-foreground">Jamais générée</span>}
          </span>
        );
      },
    }),
    columnHelper.display({
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => (
        // The menu and its dialogs are portals, but React events still bubble to the clickable row.
        <div className="flex justify-end" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <IterationActions iteration={row.original} base={base} size="sm" />
        </div>
      ),
    }),
  ]);
}

/** A template's iterations: what each one says, how its last render went, and the way to a new one. */
export function IterationsTable({
  creation,
  iterations,
  declared,
}: {
  creation: Pick<Creation, "id" | "projectId">;
  iterations: IterationListItem[];
  declared: CompositionVariable[];
}) {
  const base = creationHref(creation, "iterations");
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const columns = useMemo(() => buildColumns(declared, base), [declared, base]);
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return iterations;
    return iterations.filter(
      (iteration) =>
        iteration.name.toLowerCase().includes(needle) ||
        Object.values(iteration.values).some((value) => String(value).toLowerCase().includes(needle)),
    );
  }, [iterations, query]);

  return (
    <>
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(iteration) => iteration.id}
        onRowClick={(iteration) => router.push(`${base}/${iteration.id}`)}
        emptyMessage={iterations.length === 0 ? "Aucune itération : crée la première." : "Aucune itération ne correspond."}
        toolbar={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-xs">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Rechercher un nom, une valeur…" value={query} onChange={(e) => setQuery(e.target.value)} className="bg-card pl-8" />
            </div>
            <Button onClick={() => setCreating(true)}>
              <PlusIcon />
              Nouvelle itération
            </Button>
          </div>
        }
      />
      <NameDialog
        open={creating}
        onOpenChange={setCreating}
        title="Nouvelle itération"
        description="Elle part des valeurs par défaut du template : tu les changes ensuite, puis tu génères."
        initial={`Itération ${iterations.length + 1}`}
        submitLabel="Créer"
        onSubmit={async (name) => {
          try {
            const iteration = await createIteration(creation.id, { name });
            router.push(`${base}/${iteration.id}`);
            return true;
          } catch (error) {
            toast.error((error as Error).message);
            return false;
          }
        }}
      />
    </>
  );
}
