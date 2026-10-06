import { TemplateForm } from "@/components/studio/template-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { serverApi, type Template } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const templates = await serverApi<Template[]>("/templates");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Templates</h1>
      {templates.length === 0 ? (
        <p className="text-muted-foreground">
          Aucun template. Un template est un projet dont la composition déclare des variables
          (data-composition-variables) : demande-le à Claude pendant le build, puis enregistre le projet comme template.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {templates.map((template) => (
            <Card key={template.id}>
              <CardHeader>
                <CardTitle>{template.name}</CardTitle>
                {template.description && <CardDescription>{template.description}</CardDescription>}
              </CardHeader>
              <CardContent>
                <TemplateForm template={template} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
