"use client";

import { LayersIcon, SearchIcon, VariableIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { createDataTableColumnHelper, DataTable } from "@/components/data-table/data-table";
import { CreationActions } from "@/components/project/creation-actions";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatDateTime, formatRelative } from "@/lib/format";
import { creationHref, type CreationPhase } from "@/lib/creation-state";
import type { CreationOverview } from "@/lib/overview";
import { CREATION_TYPE_META, formatSummary, stepMeta } from "./labels";
import { MiniStepper, PhaseBadge } from "./status-badge";

const columnHelper = createDataTableColumnHelper<CreationOverview>();

const nameColumn = columnHelper.display({
  id: "name",
  header: "Création",
  cell: ({ row }) => (
    <Link href={creationHref(row.original)} className="group block min-w-40" onClick={(e) => e.stopPropagation()}>
      <span className="font-medium group-hover:underline">{row.original.name}</span>
      <span className="block text-xs text-muted-foreground">{row.original.projectName}</span>
    </Link>
  ),
});

const count = (value: number | null, icon: React.ReactNode, label: string) => (
  <span className="flex items-center gap-1.5 text-sm tabular-nums" title={label}>
    {icon}
    {value ?? "—"}
  </span>
);

/** A template's own columns: what it lets change and how often it was used. */
const templateColumns = [
  columnHelper.display({
    id: "variables",
    header: "Variables",
    cell: ({ row }) => count(row.original.variableCount, <VariableIcon className="size-4 text-muted-foreground" />, "Variables"),
  }),
  columnHelper.display({
    id: "iterations",
    header: "Itérations",
    cell: ({ row }) => count(row.original.iterationCount, <LayersIcon className="size-4 text-muted-foreground" />, "Itérations"),
  }),
];

const commonColumns = [
  columnHelper.display({
    id: "type",
    header: "Format",
    cell: ({ row }) => {
      const { icon: Icon } = CREATION_TYPE_META[row.original.type];
      return (
        <span className="flex items-center gap-2 text-sm whitespace-nowrap">
          <Icon className="size-4 text-muted-foreground" />
          {formatSummary(row.original)}
        </span>
      );
    },
  }),
  columnHelper.display({
    id: "progress",
    header: "Avancement",
    cell: ({ row }) => (
      <span className="flex flex-col gap-1.5">
        <MiniStepper steps={row.original.state.steps} />
        <span className="text-xs text-muted-foreground">{stepMeta(row.original.currentStep, row.original.type).label}</span>
      </span>
    ),
  }),
  columnHelper.display({
    id: "status",
    header: "Statut",
    cell: ({ row }) => <PhaseBadge phase={row.original.state.phase} type={row.original.type} />,
  }),
  columnHelper.display({
    id: "updated",
    header: "Modifié",
    cell: ({ row }) => (
      <span className="text-sm whitespace-nowrap text-muted-foreground" title={formatDateTime(row.original.updatedAt)}>
        {formatRelative(row.original.updatedAt)}
      </span>
    ),
  }),
];

const actionsColumn = columnHelper.display({
  id: "actions",
  header: () => <span className="sr-only">Actions</span>,
  cell: ({ row }) => (
    // The menu and its dialogs are portals, but React events still bubble to the clickable row.
    <div className="flex justify-end" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <CreationActions creation={row.original} deleteBlocked={row.original.state.phase === "running"} size="sm" afterDelete="" />
    </div>
  ),
});

function buildColumns(templates: boolean) {
  const [type, progress, status, updated] = commonColumns;
  return columnHelper.columns(
    templates
      ? [nameColumn, type, progress, ...templateColumns, status, updated, actionsColumn]
      : [nameColumn, type, progress, status, updated, actionsColumn],
  );
}

const FILTERS: { value: "all" | CreationPhase; label: string }[] = [
  { value: "all", label: "Tous" },
  { value: "review", label: "À valider" },
  { value: "running", label: "En cours" },
  { value: "failed", label: "Échecs" },
  { value: "done", label: "Prêts" },
];

/** Créations across projects (the templates): search, filter by where they stand, rename and delete. */
export function CreationsTable({ creations, templates = false }: { creations: CreationOverview[]; templates?: boolean }) {
  const router = useRouter();
  const columns = useMemo(() => buildColumns(templates), [templates]);
  const [query, setQuery] = useState("");
  const [phase, setPhase] = useState<"all" | CreationPhase>("all");

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return creations.filter(
      (creation) =>
        (phase === "all" || creation.state.phase === phase) &&
        (!needle || creation.name.toLowerCase().includes(needle) || creation.projectName.toLowerCase().includes(needle)),
    );
  }, [creations, query, phase]);

  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(creation) => creation.id}
      onRowClick={(creation) => router.push(creationHref(creation))}
      emptyMessage="Aucune création ne correspond."
      toolbar={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Rechercher une création, un projet…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="bg-card pl-8"
            />
          </div>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={phase}
            onValueChange={(value) => value && setPhase(value as typeof phase)}
            className="flex-wrap bg-card"
          >
            {FILTERS.map((filter) => (
              <ToggleGroupItem key={filter.value} value={filter.value}>
                {filter.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      }
    />
  );
}
