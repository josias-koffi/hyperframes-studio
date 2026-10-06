"use client";

import type { CompositionVariable } from "@studio/shared/browser";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { clientApi, type Template } from "@/lib/api";

type Values = Record<string, string | number | boolean>;

function Field({ variable, value, onChange }: { variable: CompositionVariable; value: Values[string]; onChange: (v: Values[string]) => void }) {
  const id = `var-${variable.id}`;
  switch (variable.type) {
    case "number":
      return <Input id={id} type="number" min={variable.min} max={variable.max} step={variable.step} value={Number(value)} onChange={(e) => onChange(e.target.valueAsNumber)} />;
    case "color":
      return <Input id={id} type="color" className="h-9 w-20 p-1" value={String(value)} onChange={(e) => onChange(e.target.value)} />;
    case "boolean":
      return <input id={id} type="checkbox" className="size-4" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />;
    case "enum":
      return (
        <Select value={String(value)} onValueChange={onChange}>
          <SelectTrigger id={id} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {variable.options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    default:
      return <Input id={id} maxLength={variable.maxLength} placeholder={variable.placeholder} value={String(value)} onChange={(e) => onChange(e.target.value)} />;
  }
}

/** Form generated from the composition's `data-composition-variables`: filling it renders without Claude. */
export function TemplateForm({ template }: { template: Template }) {
  const [values, setValues] = useState<Values>(() => Object.fromEntries(template.variables.map((v) => [v.id, v.default])));
  const [pending, setPending] = useState(false);

  async function render(format: "mp4" | "png") {
    setPending(true);
    try {
      await clientApi(`/templates/${template.id}/render`, { method: "POST", body: JSON.stringify({ format, variables: values, ...(format === "png" && { frames: 1 }) }) });
      toast.success("Rendu lancé : il apparaîtra dans les exports du projet source.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      {template.variables.map((variable) => (
        <div key={variable.id} className="space-y-2">
          <Label htmlFor={`var-${variable.id}`}>{variable.label}</Label>
          <Field variable={variable} value={values[variable.id]} onChange={(v) => setValues((current) => ({ ...current, [variable.id]: v }))} />
        </div>
      ))}
      <div className="flex gap-2">
        <Button disabled={pending} onClick={() => render("mp4")}>
          Générer la vidéo
        </Button>
        <Button variant="outline" disabled={pending} onClick={() => render("png")}>
          Générer l&apos;image
        </Button>
      </div>
    </div>
  );
}
