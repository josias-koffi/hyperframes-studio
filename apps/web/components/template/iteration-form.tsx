"use client";

import { validateVariableValues, type CompositionVariable, type RenderFormat } from "@studio/shared/browser";
import { FilmIcon, ImageIcon, RotateCcwIcon, SaveIcon, TriangleAlertIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { clientApi, type Iteration } from "@/lib/api";
import { VariableInput } from "./variable-input";

const VIDEO_FORMATS: { value: RenderFormat; label: string }[] = [
  { value: "mp4", label: "MP4" },
  { value: "webm", label: "WebM" },
  { value: "mov", label: "MOV" },
  { value: "gif", label: "GIF" },
];

/**
 * The values of one iteration, saved with it: reopening the iteration finds them as they were left.
 * Generating saves first, then renders without Claude.
 */
export function IterationForm({
  iteration,
  declarations,
  blockedReason,
}: {
  iteration: Iteration;
  declarations: CompositionVariable[];
  /** Why rendering is not possible right now (a render or Claude running), or null. */
  blockedReason: string | null;
}) {
  const router = useRouter();
  const initial = useMemo(
    () => Object.fromEntries(declarations.map((variable) => [variable.id, iteration.values[variable.id] ?? variable.default])),
    [declarations, iteration.values],
  );
  const [values, setValues] = useState<Record<string, unknown>>(initial);
  const [format, setFormat] = useState<RenderFormat>(iteration.format === "png" ? "mp4" : iteration.format);
  const [saved, setSaved] = useState(() => JSON.stringify({ values: initial, format }));
  const [pending, setPending] = useState<null | "save" | "video" | "image">(null);

  const dirty = JSON.stringify({ values, format }) !== saved;
  const errors = validateVariableValues(declarations, values);
  // Values kept for variables the template no longer declares: saved, never rendered.
  const stale = Object.keys(iteration.values).filter((key) => !declarations.some((variable) => variable.id === key));

  async function save() {
    if (!dirty) return;
    await clientApi(`/iterations/${iteration.id}`, { method: "PATCH", body: JSON.stringify({ values: { ...iteration.values, ...values }, format }) });
    setSaved(JSON.stringify({ values, format }));
  }

  async function run(kind: NonNullable<typeof pending>, render?: { format: RenderFormat; frames?: number }) {
    setPending(kind);
    try {
      await save();
      if (render) await clientApi(`/iterations/${iteration.id}/render`, { method: "POST", body: JSON.stringify(render) });
      toast.success(render ? "Rendu lancé" : "Itération enregistrée");
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <FieldGroup>
        {declarations.map((variable) => (
          <Field key={variable.id} orientation={variable.type === "boolean" ? "horizontal" : "vertical"}>
            <FieldLabel htmlFor={`var-${variable.id}`}>{variable.label}</FieldLabel>
            <VariableInput
              variable={variable}
              value={values[variable.id]}
              onChange={(value) => setValues((current) => ({ ...current, [variable.id]: value }))}
              disabled={pending !== null}
            />
            {variable.type === "string" && variable.placeholder && <FieldDescription>{variable.placeholder}</FieldDescription>}
          </Field>
        ))}
        <Field>
          <FieldLabel htmlFor="iteration-format">Format vidéo</FieldLabel>
          <Select value={format} onValueChange={(value) => setFormat(value as RenderFormat)} disabled={pending !== null}>
            <SelectTrigger id="iteration-format" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VIDEO_FORMATS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </FieldGroup>

      {errors.length > 0 && (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertDescription>{errors.join(" ; ")}</AlertDescription>
        </Alert>
      )}
      {stale.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Le template ne déclare plus {stale.join(", ")} : ces valeurs sont gardées mais ignorées au rendu.
        </p>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={pending !== null || errors.length > 0 || blockedReason !== null} onClick={() => run("video", { format })}>
            {pending === "video" ? <Spinner /> : <FilmIcon />}
            Générer la vidéo
          </Button>
          <Button variant="outline" disabled={pending !== null || errors.length > 0 || blockedReason !== null} onClick={() => run("image", { format: "png", frames: 1 })}>
            {pending === "image" ? <Spinner /> : <ImageIcon />}
            Générer une image
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" disabled={pending !== null || !dirty || errors.length > 0} onClick={() => run("save")}>
            {pending === "save" ? <Spinner /> : <SaveIcon />}
            Enregistrer sans générer
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={pending !== null || !dirty}
            onClick={() => {
              const last = JSON.parse(saved) as { values: Record<string, unknown>; format: RenderFormat };
              setValues(last.values);
              setFormat(last.format);
            }}
          >
            <RotateCcwIcon />
            Annuler les changements
          </Button>
          {dirty && <Badge variant="secondary">Modifié, non enregistré</Badge>}
        </div>
        {blockedReason && <p className="text-xs text-muted-foreground">{blockedReason}</p>}
      </div>
    </div>
  );
}
