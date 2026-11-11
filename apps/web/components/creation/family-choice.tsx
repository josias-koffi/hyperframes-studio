"use client";

import { BLOCK_FAMILIES, DEFAULT_BLOCK_FAMILY, type BlockManifest } from "@studio/shared/browser";
import { CheckIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { clientApi } from "@/lib/api";
import { cn } from "@/lib/utils";

type BlockCard = { manifest: BlockManifest; preview: string };
type Family = { id: string; name: string; description: string; samples: BlockCard[] };

/** The blocks that show a family best, in this order: its hook, its title, its call to action. */
const SAMPLE_ROLES = ["hook", "title", "cta"];

export function familyName(id: string): string {
  return BLOCK_FAMILIES[id]?.name ?? id;
}

function families(cards: BlockCard[]): Family[] {
  const byFamily = new Map<string, BlockCard[]>();
  for (const card of cards) {
    const family = card.manifest.family;
    if (!family || card.manifest.kind !== "scene") continue;
    byFamily.set(family, [...(byFamily.get(family) ?? []), card]);
  }
  return [...byFamily.entries()]
    .map(([id, members]) => {
      const samples = SAMPLE_ROLES.map((role) => members.find((card) => card.manifest.id.includes(role))).filter((card): card is BlockCard => !!card);
      return { id, name: familyName(id), description: BLOCK_FAMILIES[id]?.description ?? "", samples: samples.length ? samples : members.slice(0, 3) };
    })
    .sort((a, b) => Number(b.id === DEFAULT_BLOCK_FAMILY) - Number(a.id === DEFAULT_BLOCK_FAMILY) || a.name.localeCompare(b.name));
}

/** The family of blocks a video made with blocks takes its scenes from, chosen on live previews of its blocks. */
export function FamilyChoice({ family, onChange }: { family: string; onChange: (family: string) => void }) {
  const [list, setList] = useState<Family[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    clientApi<BlockCard[]>("/blocks")
      .then((cards) => setList(families(cards)))
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : String(caught)));
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="font-medium">Quelle famille de blocs ?</h3>
        <p className="text-sm text-muted-foreground">Toutes les scènes de la vidéo viendront de cette famille. Les aperçus jouent ses vrais blocs.</p>
      </div>
      {error && <p className="text-sm text-destructive">Familles indisponibles : {error}</p>}
      {!list && !error && <p className="text-sm text-muted-foreground">Chargement des familles…</p>}
      <div role="radiogroup" className="grid gap-4 lg:grid-cols-2">
        {list?.map((option) => {
          const selected = option.id === family;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option.id)}
              className={cn(
                "relative flex flex-col gap-3 rounded-xl border bg-card p-4 text-left transition-all hover:border-primary/50 hover:shadow-surface focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                selected && "border-primary bg-accent shadow-surface ring-1 ring-primary",
              )}
            >
              <div className="grid grid-cols-3 gap-2">
                {option.samples.map((sample) => (
                  <iframe
                    key={sample.manifest.id}
                    title={`Aperçu ${sample.manifest.name}`}
                    srcDoc={sample.preview}
                    sandbox="allow-scripts"
                    tabIndex={-1}
                    className="pointer-events-none aspect-[9/16] w-full rounded-md border bg-zinc-900"
                  />
                ))}
              </div>
              <span className="font-medium">{option.name}</span>
              {option.description && <span className="text-sm text-muted-foreground">{option.description}</span>}
              {selected && <CheckIcon className="absolute top-4 right-4 size-4 text-primary" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
