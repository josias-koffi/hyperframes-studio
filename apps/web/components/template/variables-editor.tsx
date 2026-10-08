"use client";

import { compositionVariablesSchema, type CompositionVariable } from "@studio/shared/browser";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  MessageSquareTextIcon,
  PlusIcon,
  RefreshCwIcon,
  SaveIcon,
  Trash2Icon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { clientApi } from "@/lib/api";
import { VariableInput } from "./variable-input";

type VariableType = CompositionVariable["type"];

const TYPES: { value: VariableType; label: string }[] = [
  { value: "string", label: "Texte" },
  { value: "color", label: "Couleur" },
  { value: "number", label: "Nombre" },
  { value: "enum", label: "Choix" },
  { value: "boolean", label: "Oui / non" },
];

/**
 * `review`: the variables step waits for the user, who edits and validates the list.
 * `built`: the template exists; an edited list goes back to Claude, who redoes the build.
 * `locked`: Claude is working, or the storyboard and build are being made on the validated list.
 */
export type EditorMode = "review" | "built" | "locked";

type Row = { key: number; idTouched: boolean; variable: CompositionVariable };

/** `Titre principal` → `titrePrincipal`: a safe CSS custom property and JSON key. */
export function variableIdFrom(label: string): string {
  const words = label
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase());
  const id = words.map((word, index) => (index === 0 ? word : word[0].toUpperCase() + word.slice(1))).join("");
  return /^[a-z]/.test(id) ? id : `v${id}`;
}

function retype(variable: CompositionVariable, type: VariableType): CompositionVariable {
  const base = { id: variable.id, label: variable.label };
  switch (type) {
    case "string":
      return { ...base, type, default: "" };
    case "number":
      return { ...base, type, default: 0 };
    case "color":
      return { ...base, type, default: "#000000" };
    case "boolean":
      return { ...base, type, default: false };
    case "enum":
      return { ...base, type, default: "option1", options: [{ value: "option1", label: "Option 1" }] };
  }
}

function optionalNumber(value: string): number | undefined {
  return value.trim() === "" ? undefined : Number(value);
}

/** The constraints each type accepts, edited inline under the variable. */
function Constraints({ variable, onChange, disabled }: { variable: CompositionVariable; onChange: (next: CompositionVariable) => void; disabled: boolean }) {
  if (variable.type === "string") {
    return (
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <Field>
          <FieldLabel className="text-xs text-muted-foreground">Longueur max.</FieldLabel>
          <Input
            type="number"
            min={1}
            value={variable.maxLength ?? ""}
            onChange={(e) => onChange({ ...variable, maxLength: optionalNumber(e.target.value) })}
            placeholder="Illimitée"
            disabled={disabled}
          />
        </Field>
        <Field>
          <FieldLabel className="text-xs text-muted-foreground">Aide à la saisie</FieldLabel>
          <Input
            value={variable.placeholder ?? ""}
            onChange={(e) => onChange({ ...variable, placeholder: e.target.value || undefined })}
            placeholder="Ex. : 30 caractères, sans point final"
            disabled={disabled}
          />
        </Field>
      </div>
    );
  }
  if (variable.type === "number") {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(["min", "max", "step"] as const).map((key) => (
          <Field key={key}>
            <FieldLabel className="text-xs text-muted-foreground">{{ min: "Minimum", max: "Maximum", step: "Pas" }[key]}</FieldLabel>
            <Input type="number" value={variable[key] ?? ""} onChange={(e) => onChange({ ...variable, [key]: optionalNumber(e.target.value) })} disabled={disabled} />
          </Field>
        ))}
        <Field>
          <FieldLabel className="text-xs text-muted-foreground">Unité</FieldLabel>
          <Input value={variable.unit ?? ""} onChange={(e) => onChange({ ...variable, unit: e.target.value || undefined })} placeholder="%, px, €…" disabled={disabled} />
        </Field>
      </div>
    );
  }
  if (variable.type === "enum") {
    const setOptions = (options: typeof variable.options) => {
      const fallback = options[0]?.value ?? "";
      onChange({ ...variable, options, default: options.some((o) => o.value === variable.default) ? variable.default : fallback });
    };
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Options (libellé affiché · valeur transmise à la vidéo)</p>
        {variable.options.map((option, index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              aria-label="Libellé de l'option"
              value={option.label}
              onChange={(e) => setOptions(variable.options.map((o, i) => (i === index ? { ...o, label: e.target.value } : o)))}
              disabled={disabled}
            />
            <Input
              aria-label="Valeur de l'option"
              className="font-mono"
              value={option.value}
              onChange={(e) => setOptions(variable.options.map((o, i) => (i === index ? { ...o, value: e.target.value } : o)))}
              disabled={disabled}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Retirer l'option"
              disabled={disabled || variable.options.length === 1}
              onClick={() => setOptions(variable.options.filter((_, i) => i !== index))}
            >
              <XIcon />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => {
            const n = variable.options.length + 1;
            setOptions([...variable.options, { value: `option${n}`, label: `Option ${n}` }]);
          }}
        >
          <PlusIcon />
          Ajouter une option
        </Button>
      </div>
    );
  }
  return null;
}

/**
 * The template's variable contract (`VARIABLES.json`), as an editable list: label, type, id, default value
 * and the constraints of the type. Validated with the same schema as the API before anything is sent.
 */
export function VariablesEditor({ projectId, initial, mode }: { projectId: string; initial: CompositionVariable[]; mode: EditorMode }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(() => initial.map((variable, key) => ({ key, idTouched: true, variable })));
  const [nextKey, setNextKey] = useState(initial.length);
  const [saved, setSaved] = useState(() => JSON.stringify(initial));
  const [pending, setPending] = useState<null | "save" | "approve" | "feedback" | "apply">(null);
  const [feedback, setFeedback] = useState("");
  const locked = mode === "locked" || pending !== null;

  const variables = rows.map((row) => row.variable);
  const dirty = JSON.stringify(variables) !== saved;
  const issues = useMemo(() => {
    const result = compositionVariablesSchema.safeParse(variables);
    if (result.success) return variables.length === 0 ? ["Ajoute au moins une variable."] : [];
    return result.error.issues.map((issue) => {
      const index = typeof issue.path[0] === "number" ? issue.path[0] : null;
      const label = index !== null ? (variables[index]?.label || `Variable ${index + 1}`) : "Liste";
      return `${label} : ${issue.message}`;
    });
  }, [variables]);

  function update(key: number, next: CompositionVariable, idTouched?: boolean) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, variable: next, idTouched: idTouched ?? row.idTouched } : row)));
  }

  function move(index: number, delta: number) {
    setRows((current) => {
      const next = [...current];
      const [row] = next.splice(index, 1);
      next.splice(index + delta, 0, row);
      return next;
    });
  }

  function add() {
    setRows((current) => [...current, { key: nextKey, idTouched: false, variable: { id: "", label: "", type: "string", default: "" } }]);
    setNextKey(nextKey + 1);
  }

  async function run(kind: NonNullable<typeof pending>, steps: (() => Promise<unknown>)[], success: string): Promise<boolean> {
    setPending(kind);
    try {
      for (const step of steps) await step();
      toast.success(success);
      router.refresh();
      return true;
    } catch (error) {
      toast.error((error as Error).message);
      return false;
    } finally {
      setPending(null);
    }
  }

  const save = async () => {
    if (!dirty) return;
    await clientApi(`/projects/${projectId}/variables`, { method: "PUT", body: JSON.stringify({ variables }) });
    setSaved(JSON.stringify(variables));
  };
  const post = (path: string, body?: unknown) => () =>
    clientApi(`/projects/${projectId}/${path}`, { method: "POST", body: body ? JSON.stringify(body) : undefined });

  return (
    <div className="flex flex-col gap-4">
      {rows.length === 0 && <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Aucune variable pour l&apos;instant.</p>}
      {rows.map((row, index) => {
        const { variable } = row;
        return (
          <Card key={row.key} className="gap-0 py-0 shadow-surface">
            <CardContent className="space-y-4 p-4">
              <div className="flex items-start gap-3">
                <span className="mt-1.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{index + 1}</span>
                <div className="grid min-w-0 flex-1 gap-3 md:grid-cols-[minmax(0,1.4fr)_10rem_minmax(0,1fr)]">
                  <Field>
                    <FieldLabel className="text-xs text-muted-foreground" htmlFor={`label-${row.key}`}>
                      Libellé
                    </FieldLabel>
                    <Input
                      id={`label-${row.key}`}
                      value={variable.label}
                      onChange={(e) => update(row.key, { ...variable, label: e.target.value, id: row.idTouched ? variable.id : variableIdFrom(e.target.value) })}
                      placeholder="Ex. : Titre principal"
                      disabled={locked}
                    />
                  </Field>
                  <Field>
                    <FieldLabel className="text-xs text-muted-foreground">Type</FieldLabel>
                    <Select value={variable.type} onValueChange={(type) => update(row.key, retype(variable, type as VariableType))} disabled={locked}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel className="text-xs text-muted-foreground" htmlFor={`id-${row.key}`}>
                      Identifiant
                    </FieldLabel>
                    <Input
                      id={`id-${row.key}`}
                      className="font-mono"
                      value={variable.id}
                      onChange={(e) => update(row.key, { ...variable, id: e.target.value }, true)}
                      disabled={locked}
                    />
                  </Field>
                </div>
                {mode !== "locked" && (
                  <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
                    <Button type="button" variant="ghost" size="icon-sm" aria-label="Monter" disabled={locked || index === 0} onClick={() => move(index, -1)}>
                      <ArrowUpIcon />
                    </Button>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label="Descendre" disabled={locked || index === rows.length - 1} onClick={() => move(index, 1)}>
                      <ArrowDownIcon />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Supprimer la variable"
                      disabled={locked}
                      onClick={() => setRows((current) => current.filter((r) => r.key !== row.key))}
                    >
                      <Trash2Icon />
                    </Button>
                  </div>
                )}
              </div>
              <div className="space-y-3 pl-9">
                <Field>
                  <FieldLabel className="text-xs text-muted-foreground" htmlFor={`default-${row.key}`}>
                    Valeur par défaut
                  </FieldLabel>
                  <VariableInput id={`default-${row.key}`} variable={variable} value={variable.default} onChange={(value) => update(row.key, { ...variable, default: value } as CompositionVariable)} disabled={locked} />
                </Field>
                <Constraints variable={variable} onChange={(next) => update(row.key, next)} disabled={locked} />
              </div>
            </CardContent>
          </Card>
        );
      })}

      {mode !== "locked" && (
        <Button type="button" variant="outline" className="border-dashed" onClick={add} disabled={locked}>
          <PlusIcon />
          Ajouter une variable
        </Button>
      )}

      {mode !== "locked" && issues.length > 0 && (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>À corriger avant d&apos;enregistrer</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {mode === "review" && (
        <Card className="border-warning/40 shadow-raised">
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">Variables prêtes : à toi de valider</p>
              {dirty && <Badge variant="secondary">Modifications non enregistrées</Badge>}
            </div>
            <p className="text-sm text-muted-foreground">
              Le storyboard et le montage seront construits autour de cette liste. Corrige-la directement, ou demande à Claude
              de la revoir.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button disabled={locked || issues.length > 0} onClick={() => run("approve", [save, post("approve")], "Variables validées : le storyboard démarre")}>
                {pending === "approve" ? <Spinner /> : <CheckIcon />}
                Valider et continuer
              </Button>
              <Button variant="outline" disabled={locked || !dirty || issues.length > 0} onClick={() => run("save", [save], "Variables enregistrées")}>
                {pending === "save" ? <Spinner /> : <SaveIcon />}
                Enregistrer
              </Button>
            </div>
            <div className="space-y-2 border-t pt-4">
              <Textarea
                placeholder="Ex. : ajoute le prix en variable, fusionne les deux sous-titres…"
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                rows={2}
                className="bg-card"
                disabled={locked}
              />
              <Button
                variant="outline"
                disabled={locked || !feedback.trim() || issues.length > 0}
                onClick={() => run("feedback", [save, post("feedback", { text: feedback })], "Claude revoit la liste").then((ok) => ok && setFeedback(""))}
              >
                {pending === "feedback" ? <Spinner /> : <MessageSquareTextIcon />}
                Demander à Claude de revoir la liste
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {mode === "built" && (
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={locked || !dirty || issues.length > 0} onClick={() => run("apply", [save, post("variables/apply")], "Claude met la vidéo à jour")}>
            {pending === "apply" ? <Spinner /> : <RefreshCwIcon />}
            Enregistrer et mettre à jour la vidéo
          </Button>
          <p className="text-sm text-muted-foreground">
            Claude adapte la composition à la nouvelle liste, puis tu valides le build à nouveau. Les itérations gardent leurs
            valeurs.
          </p>
        </div>
      )}
    </div>
  );
}
