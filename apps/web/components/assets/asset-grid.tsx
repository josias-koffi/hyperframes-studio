"use client";

import { FileIcon, FileTextIcon, ImageIcon, MusicIcon, Trash2Icon, TypeIcon, VideoIcon, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { clientApi, type Asset, type AssetKind } from "@/lib/api";
import { formatBytes } from "@/lib/assets";
import { formatRelative } from "@/lib/format";

const KIND_ICON: Record<AssetKind, LucideIcon> = {
  image: ImageIcon,
  logo: ImageIcon,
  video: VideoIcon,
  audio: MusicIcon,
  font: TypeIcon,
  document: FileTextIcon,
  other: FileIcon,
};

const FILTERS: { value: string; label: string; kinds: AssetKind[] }[] = [
  { value: "all", label: "Tout", kinds: [] },
  { value: "image", label: "Images", kinds: ["image", "logo"] },
  { value: "video", label: "Vidéos", kinds: ["video"] },
  { value: "audio", label: "Sons", kinds: ["audio"] },
  { value: "other", label: "Autres", kinds: ["font", "document", "other"] },
];

function Preview({ asset }: { asset: Asset }) {
  if (asset.kind === "image" || asset.kind === "logo") {
    // eslint-disable-next-line @next/next/no-img-element -- presigned storage URL
    return <img src={asset.url} alt={asset.filename} className="size-full object-contain" loading="lazy" />;
  }
  if (asset.kind === "video") return <video src={asset.url} preload="metadata" muted className="size-full bg-black object-contain" />;
  const Icon = KIND_ICON[asset.kind];
  return (
    <div className="flex size-full flex-col items-center justify-center gap-3 p-3">
      <Icon className="size-8 text-muted-foreground" />
      {asset.kind === "audio" && <audio src={asset.url} controls preload="none" className="h-8 w-full" />}
    </div>
  );
}

/** The files of the library or of a project, filterable by kind, each removable. */
export function AssetGrid({ assets, emptyText, extraAction }: { assets: Asset[]; emptyText: string; extraAction?: (asset: Asset) => React.ReactNode }) {
  const router = useRouter();
  const [filter, setFilter] = useState("all");
  const shown = useMemo(() => {
    const kinds = FILTERS.find((f) => f.value === filter)?.kinds ?? [];
    return kinds.length ? assets.filter((asset) => kinds.includes(asset.kind)) : assets;
  }, [assets, filter]);

  async function remove(asset: Asset) {
    try {
      await clientApi(`/assets/${asset.id}`, { method: "DELETE" });
      toast.success(`${asset.filename} supprimé`);
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  if (assets.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{emptyText}</p>;

  return (
    <div className="space-y-4">
      <ToggleGroup type="single" variant="outline" size="sm" value={filter} onValueChange={(v) => v && setFilter(v)} className="bg-card">
        {FILTERS.map((f) => (
          <ToggleGroupItem key={f.value} value={f.value}>
            {f.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
        {shown.map((asset) => {
          const Icon = KIND_ICON[asset.kind];
          return (
            <div key={asset.id} className="group overflow-hidden rounded-xl border bg-card shadow-surface">
              <div className="aspect-video bg-muted">
                <Preview asset={asset} />
              </div>
              <div className="flex items-center gap-2 p-3">
                <Icon className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" title={asset.filename}>
                    {asset.filename}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatBytes(asset.size)} · {formatRelative(asset.createdAt)}
                  </p>
                </div>
                {extraAction?.(asset)}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive">
                      <Trash2Icon />
                      <span className="sr-only">Supprimer {asset.filename}</span>
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Supprimer {asset.filename} ?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Le fichier est retiré du stockage. Une vidéo déjà construite qui l&apos;utilise garde sa copie.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Annuler</AlertDialogCancel>
                      <AlertDialogAction variant="destructive" onClick={() => remove(asset)}>
                        Supprimer
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
