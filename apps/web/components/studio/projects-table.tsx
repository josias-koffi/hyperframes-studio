"use client";

import type { ProjectKind } from "@studio/shared/browser";
import { LayersIcon, SearchIcon, VariableIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { createDataTableColumnHelper, DataTable } from "@/components/data-table/data-table";
import { ProjectActions } from "@/components/project/project-actions";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatDateTime, formatRelative } from "@/lib/format";
import type { ProjectOverview } from "@/lib/overview";
import { projectHref, type ProjectPhase } from "@/lib/project-state";
import { STEP_LABELS, workflowMeta } from "./labels";
import { MiniStepper, PhaseBadge } from "./status-badge";

const columnHelper = createDataTableColumnHelper<ProjectOverview>();

const nameColumn = (kind: ProjectKind) =>
  columnHelper.display({
    id: "name",
    header: kind === "template" ? "Template" : "Projet",
    cell: ({ row }) => (
      <Link href={projectHref(row.original)} className="group block min-w-40" onClick={(e) => e.stopPropagation()}>
        <span className="font-medium group-hover:underline">{row.original.name}</span>
        <span className="block font-mono text-xs text-muted-foreground">videos/{row.original.slug}</span>
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
    id: "workflow",
    header: "Type",
    cell: ({ row }) => {
      const { label, icon: Icon } = workflowMeta(row.original.workflow);
      return (
        <span className="flex items-center gap-2 text-sm">
          <Icon className="size-4 text-muted-foreground" />
          {label}
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
        <span className="text-xs text-muted-foreground">{STEP_LABELS[row.original.currentStep]}</span>
      </span>
    ),
  }),
  columnHelper.display({
    id: "status",
    header: "Statut",
    cell: ({ row }) => <PhaseBadge phase={row.original.state.phase} />,
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
      <ProjectActions project={row.original} deleteBlocked={row.original.state.phase === "running"} size="sm" afterDelete="" />
    </div>
  ),
});

function buildColumns(kind: ProjectKind) {
  const [workflow, progress, status, updated] = commonColumns;
  return columnHelper.columns(
    kind === "template"
      ? [nameColumn(kind), workflow, progress, ...templateColumns, status, updated, actionsColumn]
      : [nameColumn(kind), workflow, progress, status, updated, actionsColumn],
  );
}

const FILTERS: { value: "all" | ProjectPhase; label: string }[] = [
  { value: "all", label: "Tous" },
  { value: "review", label: "À valider" },
  { value: "running", label: "En cours" },
  { value: "failed", label: "Échecs" },
  { value: "done", label: "Prêts" },
];

/** The list of videos or of templates: search, filter by where they stand, rename and delete. */
export function ProjectsTable({ projects, kind = "oneshot" }: { projects: ProjectOverview[]; kind?: ProjectKind }) {
  const router = useRouter();
  const columns = useMemo(() => buildColumns(kind), [kind]);
  const [query, setQuery] = useState("");
  const [phase, setPhase] = useState<"all" | ProjectPhase>("all");

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return projects.filter(
      (project) =>
        (phase === "all" || project.state.phase === phase) &&
        (!needle || project.name.toLowerCase().includes(needle) || project.slug.includes(needle)),
    );
  }, [projects, query, phase]);

  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(project) => project.id}
      onRowClick={(project) => router.push(projectHref(project))}
      emptyMessage={kind === "template" ? "Aucun template ne correspond." : "Aucun projet ne correspond."}
      toolbar={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={kind === "template" ? "Rechercher un template…" : "Rechercher un projet…"}
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
