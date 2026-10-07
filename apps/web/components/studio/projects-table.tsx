"use client";

import { SearchIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { createDataTableColumnHelper, DataTable } from "@/components/data-table/data-table";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatDateTime, formatRelative } from "@/lib/format";
import type { ProjectOverview } from "@/lib/overview";
import type { ProjectPhase } from "@/lib/project-state";
import { STEP_LABELS, workflowMeta } from "./labels";
import { MiniStepper, PhaseBadge } from "./status-badge";

const columnHelper = createDataTableColumnHelper<ProjectOverview>();

const columns = columnHelper.columns([
  columnHelper.display({
    id: "name",
    header: "Projet",
    cell: ({ row }) => (
      <Link href={`/projects/${row.original.id}`} className="group block min-w-40" onClick={(e) => e.stopPropagation()}>
        <span className="font-medium group-hover:underline">{row.original.name}</span>
        <span className="block font-mono text-xs text-muted-foreground">videos/{row.original.slug}</span>
      </Link>
    ),
  }),
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
]);

const FILTERS: { value: "all" | ProjectPhase; label: string }[] = [
  { value: "all", label: "Tous" },
  { value: "review", label: "À valider" },
  { value: "running", label: "En cours" },
  { value: "failed", label: "Échecs" },
  { value: "done", label: "Prêts" },
];

export function ProjectsTable({ projects }: { projects: ProjectOverview[] }) {
  const router = useRouter();
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
      onRowClick={(project) => router.push(`/projects/${project.id}`)}
      emptyMessage="Aucun projet ne correspond."
      toolbar={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Rechercher un projet…"
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
