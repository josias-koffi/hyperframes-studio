"use client";

import { applyVariableDefaults, parseCompositionVariables, type CompositionVariable } from "@studio/shared/browser";
import { useCallback, useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useEditor } from "./editor-context";
import { ColorInput, Field, NumberInput, Section, TextArea, TextInput } from "./fields";

const INDEX = "index.html";

/**
 * The variables the template declares (`data-composition-variables` of index.html) and how to change one: the
 * editor edits its default, what the preview shows and what a new iteration starts from.
 */
export function useTemplateVariables() {
  const { files, run } = useEditor();
  const source = files[INDEX]?.content ?? null;
  const variables = useMemo(() => {
    if (!source) return [];
    try {
      return parseCompositionVariables(source);
    } catch {
      return [];
    }
  }, [source]);
  const byId = useCallback((id: string | null) => (id ? (variables.find((variable) => variable.id === id) ?? null) : null), [variables]);
  const setDefault = useCallback(
    (variable: CompositionVariable, value: unknown) =>
      run(INDEX, (html) => applyVariableDefaults(html, { [variable.id]: value }), { label: `Variable « ${variable.label} »` }),
    [run],
  );
  return { variables, byId, setDefault };
}

/** The editor's field for a variable's value, committed like the other fields (one edit, one undo step). */
export function VariableField({ variable, onCommit, disabled }: { variable: CompositionVariable; onCommit: (value: unknown) => void; disabled?: boolean }) {
  switch (variable.type) {
    case "number":
      return <NumberInput value={variable.default} min={variable.min} max={variable.max} step={variable.step} suffix={variable.unit} onCommit={onCommit} disabled={disabled} />;
    case "color":
      return <ColorInput value={variable.default} onCommit={onCommit} disabled={disabled} />;
    case "boolean":
      return <Switch checked={variable.default} onCheckedChange={onCommit} disabled={disabled} />;
    case "enum":
      return (
        <Select value={variable.default} onValueChange={onCommit} disabled={disabled}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Choisir" />
          </SelectTrigger>
          <SelectContent>
            {variable.options
              .filter((option) => option.value !== "")
              .map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label || option.value}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      );
    default: {
      const commit = (value: string) => onCommit(variable.maxLength ? value.slice(0, variable.maxLength) : value);
      return variable.maxLength && variable.maxLength <= 60 ? (
        <TextInput value={variable.default} placeholder={variable.placeholder} onCommit={commit} disabled={disabled} />
      ) : (
        <TextArea value={variable.default} onCommit={commit} disabled={disabled} />
      );
    }
  }
}

/** A layer or a clip bound to a variable: its value is edited as the variable. */
export function BoundVariable({ id, kind }: { id: string; kind: "text" | "image" }) {
  const { lock } = useEditor();
  const { byId, setDefault } = useTemplateVariables();
  const variable = byId(id);
  if (!variable) {
    return <p className="rounded-md bg-muted px-2 py-1.5 text-xs text-muted-foreground">Lié à la variable « {id} », que le template ne déclare pas.</p>;
  }
  return (
    <Field label={`Variable « ${variable.label} »`}>
      {kind === "text" && <VariableField variable={variable} onCommit={(value) => void setDefault(variable, value)} disabled={Boolean(lock)} />}
      <p className="text-xs text-muted-foreground">
{kind === "image" ? "Image par défaut du template" : "Valeur par défaut du template"} : chaque itération peut la changer.
      </p>
    </Field>
  );
}

/** Every variable of the template, when nothing is selected. */
export function TemplateVariables() {
  const { lock } = useEditor();
  const { variables, setDefault } = useTemplateVariables();
  if (variables.length === 0) return null;
  return (
    <Section title="Variables du template">
      <p className="text-xs text-muted-foreground">Valeurs par défaut : ce que montre l&apos;aperçu et le point de départ des nouvelles itérations.</p>
      {variables.map((variable) => (
        <Field key={variable.id} label={variable.label}>
          <VariableField variable={variable} onCommit={(value) => void setDefault(variable, value)} disabled={Boolean(lock)} />
        </Field>
      ))}
    </Section>
  );
}
