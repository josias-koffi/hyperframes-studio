"use client";

import type { AiModelKind } from "@studio/shared/browser";
import { CheckIcon, PlusIcon, SearchIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { CAPABILITY_META, MODEL_KIND_META, tokenPrice } from "@/components/ai/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { clientApi, type OpenRouterModel } from "@/lib/api";
import type { ModelDraft } from "./model-dialog";

/** Searches OpenRouter's list; picking a model opens the add dialog prefilled with it. */
export function ImportDialog({ open, onOpenChange, onPick }: { open: boolean; onOpenChange: (open: boolean) => void; onPick: (draft: ModelDraft) => void }) {
  const [kind, setKind] = useState<AiModelKind>("agent");
  const [query, setQuery] = useState("");
  const [models, setModels] = useState<OpenRouterModel[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setModels(null);
      setError(null);
      const params = new URLSearchParams({ kind, ...(query.trim() ? { q: query.trim() } : {}) });
      clientApi<OpenRouterModel[]>(`/admin/openrouter-models?${params}`)
        .then((rows) => !cancelled && setModels(rows))
        .catch((reason: Error) => !cancelled && setError(reason.message));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, kind, query]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importer depuis OpenRouter</DialogTitle>
          <DialogDescription>
            Les modèles de génération doivent savoir appeler des outils. Les voix de synthèse n&apos;apparaissent pas ici : ajoute-les à la main.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <ToggleGroup type="single" variant="outline" value={kind} onValueChange={(next) => next && setKind(next as AiModelKind)}>
            {(["agent", "music"] as const).map((value) => (
              <ToggleGroupItem key={value} value={value} className="px-3 data-[state=on]:border-primary data-[state=on]:bg-accent">
                {MODEL_KIND_META[value].label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input autoFocus className="pl-8" placeholder="claude, gpt, gemini, qwen…" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
        </div>
        <ScrollArea className="-mx-6 h-[min(28rem,55svh)] px-6">
          {error ? (
            <p className="py-8 text-center text-sm text-destructive">{error}</p>
          ) : models === null ? (
            <div className="space-y-2 py-1">
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="h-16 w-full" />
              ))}
            </div>
          ) : models.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Aucun modèle ne correspond.</p>
          ) : (
            <ul className="divide-y">
              {models.map((model) => {
                const added = model.inCatalog.includes(kind);
                return (
                  <li key={model.id} className="flex items-start gap-3 py-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="truncate text-sm font-medium">{model.name}</p>
                      <p className="truncate font-mono text-xs text-muted-foreground">{model.id}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {tokenPrice(model) && <Badge variant="secondary">{tokenPrice(model)}</Badge>}
                        {model.contextLength && <Badge variant="outline">{Math.round(model.contextLength / 1000)}k contexte</Badge>}
                        {model.capabilities
                          .filter((capability) => capability !== "tools")
                          .map((capability) => (
                            <Badge key={capability} variant="outline" title={CAPABILITY_META[capability].hint}>
                              {CAPABILITY_META[capability].label}
                            </Badge>
                          ))}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={added ? "ghost" : "outline"}
                      disabled={added}
                      onClick={() =>
                        onPick({
                          openrouterId: model.id,
                          kind,
                          label: model.name.replace(/^[^:]+:\s*/, ""),
                          description: model.description.slice(0, 500),
                          voices: model.voices,
                          pricing: model.pricing,
                          contextLength: model.contextLength,
                          capabilities: model.capabilities,
                        })
                      }
                    >
                      {added ? <CheckIcon /> : <PlusIcon />}
                      {added ? "Ajouté" : "Ajouter"}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
