"use client";

import { AI_MODEL_KINDS, type AiModelKind } from "@studio/shared/browser";
import { BoxesIcon, CloudDownloadIcon, RefreshCwIcon, MoreHorizontalIcon, PencilIcon, PlusIcon, SearchIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { CAPABILITY_META, mediaPriceLabel, MODEL_KIND_META, tokenPrice } from "@/components/ai/labels";
import { createDataTableColumnHelper, DataTable } from "@/components/data-table/data-table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { clientApi, type AiModel } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ImportDialog } from "./import-dialog";
import { ModelDialog, type ModelDraft } from "./model-dialog";

const columnHelper = createDataTableColumnHelper<AiModel>();

type Editing = { model?: AiModel; draft?: ModelDraft; key: number } | null;

/** The models users may pick: switch one off and its users fall back to the defaults on their next generation. */
export function ModelsCatalog({ models }: { models: AiModel[] }) {
  const router = useRouter();
  const [kind, setKind] = useState<AiModelKind | "all">("all");
  const [query, setQuery] = useState("");
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState<Editing>(null);
  const [removing, setRemoving] = useState<AiModel | null>(null);
  const [pending, startTransition] = useTransition();

  const refresh = () => router.refresh();

  function toggle(model: AiModel, enabled: boolean) {
    startTransition(async () => {
      try {
        await clientApi(`/admin/ai-models/${model.id}`, { method: "PATCH", body: JSON.stringify({ enabled }) });
        toast.success(enabled ? `${model.label} proposé aux utilisateurs` : `${model.label} retiré des choix`);
        refresh();
      } catch (error) {
        toast.error((error as Error).message);
      }
    });
  }

  function remove(model: AiModel) {
    startTransition(async () => {
      try {
        await clientApi(`/admin/ai-models/${model.id}`, { method: "DELETE" });
        toast.success(`${model.label} supprimé du catalogue`);
        setRemoving(null);
        refresh();
      } catch (error) {
        toast.error((error as Error).message);
      }
    });
  }

  function refreshFromOpenRouter() {
    startTransition(async () => {
      try {
        const { updated } = await clientApi<{ updated: number }>("/admin/ai-models/refresh", { method: "POST" });
        toast.success(`${updated} modèle${updated > 1 ? "s" : ""} relu${updated > 1 ? "s" : ""} depuis OpenRouter`);
        refresh();
      } catch (error) {
        toast.error((error as Error).message);
      }
    });
  }

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return models.filter(
      (model) => (kind === "all" || model.kind === kind) && (!needle || model.label.toLowerCase().includes(needle) || model.openrouterId.includes(needle)),
    );
  }, [models, kind, query]);

  const columns = columnHelper.columns([
    columnHelper.display({
      id: "model",
      header: "Modèle",
      cell: ({ row }) => (
        <span className="block min-w-48">
          <span className="font-medium">{row.original.label}</span>
          <span className="block font-mono text-xs text-muted-foreground">{row.original.openrouterId}</span>
        </span>
      ),
    }),
    columnHelper.display({
      id: "kind",
      header: "Type",
      cell: ({ row }) => <Badge variant="secondary">{MODEL_KIND_META[row.original.kind].label}</Badge>,
    }),
    columnHelper.display({
      id: "details",
      header: "Prix / voix",
      cell: ({ row }) => {
        const model = row.original;
        if (model.kind === "tts") return <span className="text-sm text-muted-foreground">{model.voices.length ? `${model.voices.length} voix` : "Voix libre"}</span>;
        if (model.kind === "image" || model.kind === "video")
          return <span className="text-sm whitespace-nowrap text-muted-foreground tabular-nums">{mediaPriceLabel(model) ?? "Prix à renseigner"}</span>;
        return <span className="text-sm whitespace-nowrap text-muted-foreground tabular-nums">{tokenPrice(model) ?? "—"}</span>;
      },
    }),
    columnHelper.display({
      id: "capabilities",
      header: "Capacités",
      cell: ({ row }) =>
        row.original.kind === "agent" ? (
          <span className="flex flex-wrap gap-1">
            {row.original.capabilities.length === 0 && <span className="text-sm text-muted-foreground">—</span>}
            {row.original.capabilities.map((capability) => (
              <Badge key={capability} variant="outline" title={CAPABILITY_META[capability].hint}>
                {CAPABILITY_META[capability].label}
              </Badge>
            ))}
          </span>
        ) : null,
    }),
    columnHelper.display({
      id: "enabled",
      header: "Proposé",
      cell: ({ row }) => (
        <Switch
          checked={row.original.enabled}
          disabled={pending}
          aria-label={`Proposer ${row.original.label}`}
          onCheckedChange={(enabled) => toggle(row.original, enabled)}
        />
      ),
    }),
    columnHelper.display({
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={`Actions pour ${row.original.label}`}>
              <MoreHorizontalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setEditing({ model: row.original, key: Date.now() })}>
              <PencilIcon />
              Modifier
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => setRemoving(row.original)}>
              <Trash2Icon />
              Supprimer
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    }),
  ]);

  const actions = (
    <>
      {models.length > 0 && (
        <Button variant="outline" onClick={refreshFromOpenRouter} disabled={pending} title="Relit les capacités et les prix de chaque modèle du catalogue.">
          <RefreshCwIcon />
          Relire OpenRouter
        </Button>
      )}
      <Button variant="outline" onClick={() => setEditing({ key: Date.now() })}>
        <PlusIcon />
        Ajouter à la main
      </Button>
      <Button onClick={() => setImporting(true)}>
        <CloudDownloadIcon />
        Importer depuis OpenRouter
      </Button>
    </>
  );

  return (
    <div className="space-y-5">
      {models.length === 0 ? (
        <Empty className="border bg-card shadow-surface">
          <EmptyHeader>
            <EmptyMedia variant="icon" className="bg-primary/10 text-primary">
              <BoxesIcon />
            </EmptyMedia>
            <EmptyTitle>Catalogue vide</EmptyTitle>
            <EmptyDescription>
              Importe les modèles de génération et de musique depuis OpenRouter, ajoute les voix de synthèse à la main, puis fixe les choix par défaut.
              Tant que le catalogue est vide, personne ne peut générer via OpenRouter.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent className="flex-row justify-center">{actions}</EmptyContent>
        </Empty>
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          getRowId={(model) => model.id}
          pageSize={15}
          emptyMessage="Aucun modèle ne correspond."
          toolbar={
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative w-full lg:max-w-xs">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="bg-card pl-8" placeholder="Rechercher un modèle…" value={query} onChange={(event) => setQuery(event.target.value)} />
              </div>
              <nav aria-label="Filtrer par type" className="flex flex-wrap gap-1">
                {(["all", ...AI_MODEL_KINDS] as const).map((value) => {
                  const count = value === "all" ? models.length : models.filter((model) => model.kind === value).length;
                  return (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={kind === value}
                      onClick={() => setKind(value)}
                      className={cn(
                        "flex shrink-0 items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors hover:bg-accent",
                        kind === value ? "border-primary bg-accent font-medium" : "bg-card",
                      )}
                    >
                      {value === "all" ? "Tous" : MODEL_KIND_META[value].label}
                      <span className="rounded-md bg-muted px-1.5 text-xs text-muted-foreground tabular-nums">{count}</span>
                    </button>
                  );
                })}
              </nav>
              <div className="flex flex-wrap gap-2 lg:ml-auto">{actions}</div>
            </div>
          }
        />
      )}

      <ImportDialog
        open={importing}
        onOpenChange={setImporting}
        onPick={(draft) => {
          setImporting(false);
          setEditing({ draft, key: Date.now() });
        }}
      />
      {editing && (
        <ModelDialog
          key={editing.key}
          open
          onOpenChange={(open) => !open && setEditing(null)}
          model={editing.model}
          draft={editing.draft}
          onSaved={refresh}
        />
      )}
      <AlertDialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer {removing?.label} ?</AlertDialogTitle>
            <AlertDialogDescription>
              Les utilisateurs qui l&apos;avaient choisi repasseront sur le modèle par défaut. Les générations passées gardent leur historique.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={() => removing && remove(removing)}>
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
