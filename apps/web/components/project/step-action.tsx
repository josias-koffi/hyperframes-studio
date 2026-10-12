"use client";

import { ArrowRightIcon, CheckIcon, EyeIcon, MessageSquareTextIcon, PlayIcon, RotateCcwIcon, SparklesIcon, TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { CREATION_TYPE_META, stepMeta } from "@/components/studio/labels";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { clientApi, type Creation } from "@/lib/api";
import { creationHref, type CreationState } from "@/lib/creation-state";

export function useCreationAction(creationId: string) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function act(path: string, body?: unknown): Promise<boolean> {
    setPending(true);
    try {
      await clientApi(`/creations/${creationId}/${path}`, { method: "POST", body: body ? JSON.stringify(body) : undefined });
      router.refresh();
      return true;
    } catch (error) {
      toast.error((error as Error).message);
      return false;
    } finally {
      setPending(false);
    }
  }
  return { pending, act };
}

function Shell({ tone, icon, title, text, children }: { tone: string; icon: React.ReactNode; title: React.ReactNode; text: React.ReactNode; children?: React.ReactNode }) {
  return (
    <Card className={`shadow-surface ${tone}`}>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {icon}
        <div className="min-w-0 flex-1">
          <p className="font-medium">{title}</p>
          <div className="text-sm text-muted-foreground">{text}</div>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

const ICON = "flex size-10 shrink-0 items-center justify-center rounded-full";

/**
 * The one thing to do next on the création's current step: launch it, follow it, review it or retry it.
 * `stepHref` adds a link to the step page (the overview); the step page itself leaves it out.
 */
export function StepAction({ creation, state, stepHref }: { creation: Creation; state: CreationState; stepHref?: string }) {
  const { pending, act } = useCreationAction(creation.id);
  const [feedback, setFeedback] = useState("");
  const step = stepMeta(creation.currentStep, creation.type);
  const { noun } = CREATION_TYPE_META[creation.type];
  const link = stepHref && (
    <Button variant="ghost" asChild>
      <Link href={stepHref}>
        Voir l&apos;étape
        <ArrowRightIcon />
      </Link>
    </Button>
  );

  if (state.phase === "running") {
    return (
      <div className="relative overflow-hidden rounded-xl">
        <div aria-hidden className="pointer-events-none absolute inset-0 z-10 live-shimmer" />
        <Shell
          tone="border-rec/30"
          icon={
            <span className={`${ICON} bg-rec/10 text-rec`}>
              <Spinner className="size-5" />
            </span>
          }
          title={`${step.doing}…`}
          text="Tu peux quitter la page : la génération continue et le journal se met à jour en direct."
        >
          {link}
        </Shell>
      </div>
    );
  }

  if (state.phase === "review") {
    const isBuild = creation.currentStep === "build";
    const isTemplate = creation.kind === "template";
    const delivery = { video: "lancer le rendu MP4", realistic: "lancer le rendu MP4", carousel: "générer les slides et le PDF", image: "générer le PNG" }[creation.type];
    const afterApproval = isBuild ? (isTemplate ? "créer la première itération du template" : delivery) : "passer à l'étape suivante";
    return (
      <Card className="border-warning/40 shadow-raised">
        <CardContent className="space-y-4">
          <div className="flex items-start gap-4">
            <span className={`${ICON} bg-warning/10 text-warning`}>
              <EyeIcon className="size-5" />
            </span>
            <div className="flex-1">
              <p className="font-medium">{step.label} prêt : à toi de valider</p>
              <p className="text-sm text-muted-foreground">
                Valide pour {afterApproval}, ou écris ce qu&apos;il faut
                changer : Claude reprend la même étape avec ton retour.
              </p>
            </div>
            {link}
          </div>
          {!stepHref && (
            <>
              <Textarea
                placeholder={creation.type === "video" ? "Ex. : raccourcir la frame 2, ton plus direct, logo plus grand…" : "Ex. : titre plus court, contraste plus fort, logo plus grand…"}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                rows={3}
                className="bg-card"
              />
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => act("approve")} disabled={pending}>
                  <CheckIcon />
                  {isBuild ? (isTemplate ? "Valider le template" : `Valider et rendre ${noun}`) : "Valider et continuer"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => act("feedback", { text: feedback }).then((ok) => ok && setFeedback(""))}
                  disabled={pending || !feedback.trim()}
                >
                  <MessageSquareTextIcon />
                  Demander une modification
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  if (state.phase === "failed") {
    return (
      <Shell
        tone="border-destructive/40"
        icon={
          <span className={`${ICON} bg-destructive/10 text-destructive`}>
            <TriangleAlertIcon className="size-5" />
          </span>
        }
        title={`L'étape ${step.label.toLowerCase()} a échoué`}
        text={<span className="line-clamp-2">{state.claudeJob?.resultText ?? "Le détail est dans le journal de Claude."}</span>}
      >
        {link}
        <Button onClick={() => act("generate")} disabled={pending}>
          <RotateCcwIcon />
          Relancer l&apos;étape
        </Button>
      </Shell>
    );
  }

  if (state.phase === "done" && creation.kind === "template") {
    return (
      <Shell
        tone="border-success/40"
        icon={
          <span className={`${ICON} bg-success/10 text-success`}>
            <SparklesIcon className="size-5" />
          </span>
        }
        title="Template prêt"
        text="Crée une itération, remplis ses variables et génère : le rendu part sans Claude."
      >
        <Button variant="outline" asChild>
          <Link href={creationHref(creation, "iterations")}>
            Voir les itérations
            <ArrowRightIcon />
          </Link>
        </Button>
      </Shell>
    );
  }

  if (state.phase === "done") {
    return (
      <Shell
        tone="border-success/40"
        icon={
          <span className={`${ICON} bg-success/10 text-success`}>
            <SparklesIcon className="size-5" />
          </span>
        }
        title={{ video: "Vidéo générée", realistic: "Vidéo générée", carousel: "Carrousel généré", image: "Image générée" }[creation.type]}
        text={`${
          { video: "Le rendu MP4 part automatiquement.", realistic: "Le rendu MP4 part automatiquement.", carousel: "Les slides et le PDF partent automatiquement.", image: "Le PNG part automatiquement." }[creation.type]
        } Pour retoucher ${noun} à la main, ouvre-${creation.type === "carousel" ? "le" : "la"} dans le Studio HyperFrames.`}
      >
        <Button variant="outline" asChild>
          <Link href={creationHref(creation, "exports")}>
            Voir les exports
            <ArrowRightIcon />
          </Link>
        </Button>
      </Shell>
    );
  }

  return (
    <Shell
      tone="border-primary/30"
      icon={
        <span className={`${ICON} bg-primary/10 text-primary`}>
          <step.icon className="size-5" />
        </span>
      }
      title={`Prochaine étape : ${step.label.toLowerCase()}`}
      text={step.hint}
    >
      <Button size="lg" onClick={() => act("generate")} disabled={pending}>
        <PlayIcon />
        Lancer {step.label.toLowerCase()}
      </Button>
    </Shell>
  );
}
