"use client";

import { CheckIcon, MessageSquareTextIcon, RefreshCwIcon, ShieldAlertIcon, SparklesIcon, TriangleAlertIcon, Volume2Icon } from "lucide-react";
import { useState } from "react";
import { useCreationAction } from "@/components/project/step-action";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Textarea } from "@/components/ui/textarea";
import { estimateOf, usd, type ShotsData, type ShotView } from "@/lib/shots";

type Step = "keyframes" | "shots";

const VERDICTS = { real_person: "personne réelle", brand: "marque sans droits" } as const;

/** A request that may go over the budget: sent as is, or after the user confirmed the overrun. */
type Pending = { title: string; text: string; run: (confirmBudget: boolean) => Promise<boolean> } | null;

function Generated({ shot, step }: { shot: ShotView; step: Step }) {
  const generation = step === "keyframes" ? shot.keyframe : shot.shot;
  if (!generation) return <p className="text-xs text-muted-foreground">Pas encore généré.</p>;
  if (generation.status === "failed") return <p className="text-xs text-destructive">Échec : {generation.error}</p>;
  return (
    <p className="text-xs text-muted-foreground">
      {generation.model}
      {generation.pass === "final" ? " · rendu final" : step === "shots" ? " · brouillon" : ""}
      {generation.seconds ? ` · ${generation.seconds} s` : ""}
      {generation.costUsd !== undefined ? ` · ≈ ${usd(generation.costUsd)}` : ""}
    </p>
  );
}

/**
 * The keyframes or the shots of a realistic création, one card each: regenerate one with or without a comment (which
 * rewrites its prompt), keep the shots for the final pass, approve the step. Whatever may go over the création's
 * budget asks first; a run the budget stopped waits here for the confirmation.
 */
export function ShotsReview({
  creationId,
  step,
  data,
  review,
  failed,
  version,
}: {
  creationId: string;
  step: Step;
  data: ShotsData;
  /** The step waits for the user's review. */
  review: boolean;
  /** The step's last run failed (the budget may have stopped it). */
  failed: boolean;
  version?: string;
}) {
  const { pending, act } = useCreationAction(creationId);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [kept, setKept] = useState<string[]>([]);
  const [feedback, setFeedback] = useState("");
  const [confirm, setConfirm] = useState<Pending>(null);
  const file = (path: string) => `/api/creations/${creationId}/files/${path}?v=${version ?? ""}`;
  const left = data.budgetUsd - data.spentUsd;

  /** Runs `request` at once when it fits the budget, else asks the user first. */
  function guarded(cost: { usd: number; unpriced: boolean }, what: string, run: (confirmBudget: boolean) => Promise<boolean>) {
    if (!cost.unpriced && cost.usd <= left) return void run(false);
    setConfirm({
      title: "Dépasser le budget ?",
      text: cost.unpriced
        ? `Un modèle n'a pas de prix au catalogue : le coût de ${what} ne peut pas être estimé.`
        : `${what.charAt(0).toUpperCase()}${what.slice(1)} coûterait environ ${usd(cost.usd)} ; ${usd(data.spentUsd)} sont déjà dépensés sur un budget de ${usd(data.budgetUsd)}.`,
      run,
    });
  }

  const regenerate = (shot: ShotView) => {
    const comment = comments[shot.id]?.trim();
    const cost = estimateOf([shot], step === "keyframes" ? "keyframe" : "draft");
    guarded(cost, `régénérer ${shot.id}`, (confirmBudget) =>
      act("shots", { only: [shot.id], ...(comment ? { feedback: comment } : {}), ...(confirmBudget ? { confirmBudget } : {}) }),
    );
  };

  // Shots the guardrail refused: nothing went to fal; a comment rewrites their prompt.
  const refused = failed && data.refused?.step === step ? data.refused.shots : [];
  const refusal = (id: string) => refused.find((shot) => shot.id === id);
  const keptShots = data.shots.filter((shot) => kept.includes(shot.id));
  const draftAll = estimateOf(data.shots, "draft");
  const finalKept = estimateOf(keptShots, "final");

  if (data.shots.length === 0)
    return (
      <Empty className="border bg-card shadow-surface">
        <EmptyHeader>
          <EmptyTitle>Aucun plan généré</EmptyTitle>
          <EmptyDescription>Le storyboard ne demande aucun plan filmé : la vidéo est faite de blocs graphiques et des fichiers fournis.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );

  return (
    <div className="flex flex-col gap-6">
      {failed && data.blocked?.step === step && (
        <Card className="border-warning/40 shadow-raised">
          <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <TriangleAlertIcon className="size-5 shrink-0 text-warning" />
            <div className="flex-1 text-sm">
              <p className="font-medium">Génération arrêtée par le budget</p>
              <p className="text-muted-foreground">
                {data.blocked.unpriced.length
                  ? `Prix inconnu pour ${data.blocked.unpriced.join(", ")}.`
                  : `${data.blocked.only.join(", ")} : environ ${usd(data.blocked.estimateUsd)}, avec ${usd(data.blocked.spentUsd)} déjà dépensés sur ${usd(data.blocked.budgetUsd)}.`}
              </p>
            </div>
            <Button
              disabled={pending}
              onClick={() => act("shots", { only: data.blocked!.only, pass: data.blocked!.pass, confirmBudget: true })}
            >
              <CheckIcon />
              Confirmer et générer
            </Button>
          </CardContent>
        </Card>
      )}

      {refused.length > 0 && (
        <Card className="border-destructive/40 shadow-raised">
          <CardContent className="flex gap-4">
            <ShieldAlertIcon className="size-5 shrink-0 text-destructive" />
            <div className="flex-1 space-y-1 text-sm">
              <p className="font-medium">Plans refusés avant la génération</p>
              <p className="text-muted-foreground">
                Une personne réelle reconnaissable ou une marque sans droits ne part pas chez fal. Décris dans le commentaire du plan ce qu&apos;il faut montrer à la place : des personnes anonymes, la marque de la campagne.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Badge variant="outline">Dépensé : {usd(data.spentUsd)}</Badge>
        <Badge variant="outline">Budget : {usd(data.budgetUsd)}</Badge>
        {step === "keyframes" && <Badge variant="outline">Plans en brouillon : ≈ {draftAll.unpriced ? "prix inconnu" : usd(draftAll.usd)}</Badge>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {data.shots.map((shot) => {
          const ready = step === "keyframes" ? shot.keyframe?.status === "ok" : shot.shot?.status === "ok";
          return (
            <Card key={shot.id} className="gap-3 overflow-hidden pt-0 shadow-surface">
              <div className="flex aspect-[9/16] max-h-[28rem] items-center justify-center bg-muted">
                {ready ? (
                  step === "keyframes" ? (
                    // eslint-disable-next-line @next/next/no-img-element -- workspace file served by the API
                    <img alt={`Image clé ${shot.id}`} src={file(`assets/shots/${shot.id}.png`)} className="size-full object-contain" />
                  ) : (
                    <video controls muted={!shot.audio} playsInline preload="metadata" src={file(`assets/shots/${shot.id}.mp4`)} className="size-full object-contain" />
                  )
                ) : (
                  <span className="text-sm text-muted-foreground">Pas d&apos;aperçu</span>
                )}
              </div>
              <CardHeader className="gap-1">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">{shot.id}</span>
                  {shot.title}
                  <span className="ml-auto text-xs font-normal text-muted-foreground">{shot.duration} s</span>
                  {shot.audio && <Volume2Icon className="size-3.5 text-muted-foreground" aria-label="Son du plan conservé" />}
                </CardTitle>
                <CardDescription className="text-xs">
                  {shot.prompt}
                  {shot.camera && <em> · {shot.camera}</em>}
                </CardDescription>
                {refusal(shot.id) ? (
                  <p className="text-xs text-destructive">
                    Refusé ({VERDICTS[refusal(shot.id)!.verdict]}) : {refusal(shot.id)!.reason}
                  </p>
                ) : (
                  <Generated shot={shot} step={step} />
                )}
              </CardHeader>
              {(review || refusal(shot.id)) && (
                <CardFooter className="flex-col items-stretch gap-2">
                  <Textarea
                    rows={2}
                    placeholder="Ce qu'il faut changer dans ce plan (facultatif)"
                    value={comments[shot.id] ?? ""}
                    onChange={(event) => setComments((current) => ({ ...current, [shot.id]: event.target.value }))}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Button size="sm" variant="outline" disabled={pending || (Boolean(refusal(shot.id)) && !comments[shot.id]?.trim())} onClick={() => regenerate(shot)}>
                      <RefreshCwIcon />
                      {comments[shot.id]?.trim() ? "Corriger et régénérer" : "Régénérer"}
                    </Button>
                    {step === "shots" && review && (
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={kept.includes(shot.id)}
                          onCheckedChange={(checked) => setKept((current) => (checked ? [...current, shot.id] : current.filter((id) => id !== shot.id)))}
                        />
                        Rendu final
                      </label>
                    )}
                  </div>
                </CardFooter>
              )}
            </Card>
          );
        })}
      </div>

      {review && (
        <Card className="border-warning/40 shadow-raised">
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {step === "keyframes"
                ? "Valide pour animer chaque image clé avec le modèle de brouillon, ou décris ce qu'il faut changer : seuls les plans concernés sont régénérés."
                : "Coche les plans à passer au modèle final, ou valide pour continuer avec les plans tels qu'ils sont."}
            </p>
            <Textarea placeholder="Ex. : lumière plus chaude sur tous les plans, cadrage plus serré…" value={feedback} onChange={(event) => setFeedback(event.target.value)} rows={2} />
            <div className="flex flex-wrap gap-2">
              {step === "keyframes" ? (
                <Button disabled={pending} onClick={() => guarded(draftAll, "l'animation des plans", (confirmBudget) => act("approve", confirmBudget ? { confirmBudget } : undefined))}>
                  <CheckIcon />
                  Valider et générer les plans{draftAll.unpriced ? "" : ` (≈ ${usd(draftAll.usd)})`}
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    disabled={pending || keptShots.length === 0}
                    onClick={() =>
                      guarded(finalKept, "le rendu final", (confirmBudget) =>
                        act("shots", { only: keptShots.map((shot) => shot.id), pass: "final", ...(confirmBudget ? { confirmBudget } : {}) }),
                      )
                    }
                  >
                    <SparklesIcon />
                    Rendu final de {keptShots.length} plan{keptShots.length > 1 ? "s" : ""}
                    {keptShots.length && !finalKept.unpriced ? ` (≈ ${usd(finalKept.usd)})` : ""}
                  </Button>
                  <Button disabled={pending} onClick={() => act("approve")}>
                    <CheckIcon />
                    Valider les plans et continuer
                  </Button>
                </>
              )}
              <Button
                variant="outline"
                disabled={pending || !feedback.trim()}
                onClick={() => act("feedback", { text: feedback }).then((ok) => ok && setFeedback(""))}
              >
                <MessageSquareTextIcon />
                Corriger tous les plans
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.text}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <Button
              disabled={pending}
              onClick={async () => {
                const run = confirm?.run;
                setConfirm(null);
                await run?.(true);
              }}
            >
              Confirmer le dépassement
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
