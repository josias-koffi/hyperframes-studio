"use client";

import { LibraryIcon, PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { clientApi, type Asset } from "@/lib/api";
import { formatBytes } from "@/lib/assets";

/** Copies files of the shared library into the project. */
export function LibraryImport({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [library, setLibrary] = useState<Asset[] | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  async function load(open: boolean) {
    if (!open) return;
    try {
      setLibrary(await clientApi<Asset[]>("/assets"));
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  async function attach(asset: Asset) {
    setPending(asset.id);
    try {
      await clientApi(`/assets/${asset.id}/attach`, { method: "POST", body: JSON.stringify({ projectId }) });
      toast.success(`${asset.filename} ajouté au projet`);
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setPending(null);
    }
  }

  return (
    <Sheet onOpenChange={load}>
      <SheetTrigger asChild>
        <Button variant="outline">
          <LibraryIcon />
          Importer depuis la bibliothèque
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Bibliothèque</SheetTitle>
          <SheetDescription>Les fichiers partagés entre toutes tes vidéos (logos, polices, musiques…).</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-2 overflow-y-auto px-4 pb-4">
          {library === null ? (
            <>
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </>
          ) : library.length === 0 ? (
            <p className="text-sm text-muted-foreground">La bibliothèque est vide : ajoute des fichiers depuis la page Assets.</p>
          ) : (
            library.map((asset) => (
              <div key={asset.id} className="flex items-center gap-3 rounded-lg border p-2">
                <div className="size-12 shrink-0 overflow-hidden rounded-md bg-muted">
                  {(asset.kind === "image" || asset.kind === "logo") && (
                    // eslint-disable-next-line @next/next/no-img-element -- presigned storage URL
                    <img src={asset.url} alt="" className="size-full object-cover" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{asset.filename}</p>
                  <p className="text-xs text-muted-foreground">{formatBytes(asset.size)}</p>
                </div>
                <Button size="sm" variant="secondary" disabled={pending === asset.id} onClick={() => attach(asset)}>
                  <PlusIcon />
                  Ajouter
                </Button>
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
