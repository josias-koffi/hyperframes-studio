"use client";

import { SparklesIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { JobLog } from "@/components/studio/job-log";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { clientApi, type Job } from "@/lib/api";
import { useEditor } from "./editor-context";

const EXAMPLES = ["Agrandis le titre", "Mets le fond en bleu nuit", "Ajoute une animation d'entrée au logo"];

/**
 * Asks the assistant for a change in plain words. The création is locked while it works on it, then every file is
 * read again and the preview reloads.
 */
export function AssistantPanel({ context }: { context: string | null }) {
  const { creation, lock, setLock, reloadAll, flush } = useEditor();
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [lastJob, setLastJob] = useState<string | null>(null);

  async function send() {
    if (!text.trim()) return;
    setPending(true);
    try {
      await flush();
      await clientApi(`/creations/${creation.id}/editor/checkpoint`, { method: "POST" }).catch(() => null);
      const job = await clientApi<Job>(`/creations/${creation.id}/edit-request`, {
        method: "POST",
        body: JSON.stringify({ text: text.trim(), context: context ?? undefined }),
      });
      setLock({ jobId: job.id });
      setLastJob(job.id);
      setText("");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setPending(false);
    }
  }

  async function settled(status: string) {
    setLock(null);
    await reloadAll();
    if (status === "succeeded") toast.success("Modification de l'assistant appliquée");
    else toast.error("L'assistant n'a pas pu faire la modification.");
  }

  const shownJob = lock?.jobId ?? lastJob;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3">
      <div className="space-y-1">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <SparklesIcon className="size-4 text-primary" />
          Demander à l&apos;assistant
        </p>
        <p className="text-xs text-muted-foreground">Décris le changement : l&apos;assistant modifie la création, tes retouches manuelles sont gardées.</p>
      </div>
      {context && <p className="rounded-md bg-muted px-2 py-1.5 text-xs text-muted-foreground">Sélection : {context}</p>}
      <Textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void send();
        }}
        placeholder="Ex. : rends le titre plus gros et passe-le en jaune"
        className="min-h-24 resize-none text-sm"
        disabled={Boolean(lock) || pending}
      />
      <div className="flex flex-wrap gap-1.5">
        {EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={() => setText(example)}
            disabled={Boolean(lock)}
          >
            {example}
          </button>
        ))}
      </div>
      <Button onClick={send} disabled={!text.trim() || Boolean(lock) || pending}>
        <SparklesIcon />
        {lock ? "L'assistant travaille…" : "Envoyer à l'assistant"}
      </Button>
      {shownJob && <JobLog key={shownJob} jobId={shownJob} onSettled={lock?.jobId === shownJob ? settled : undefined} className="min-h-0 flex-1" />}
    </div>
  );
}
