import type { Metadata } from "next";
import { PreferencesForm } from "@/components/ai/preferences-form";
import { PageHeader } from "@/components/layout/page-header";
import type { AiModel, AiSettings } from "@/lib/api";
import { serverApi } from "@/lib/server-api";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Modèles IA" };

export default async function AiSettingsPage() {
  const [settings, models] = await Promise.all([serverApi<AiSettings>("/me/ai-settings"), serverApi<AiModel[]>("/ai-models")]);

  return (
    <>
      <PageHeader
        title="Modèles IA"
        description="Choisis le modèle de chaque étape de génération, celui des modifications dans l'éditeur, et la voix off. Tes choix s'appliquent aux prochaines générations."
      />
      <div className="mx-auto w-full max-w-4xl px-4 lg:px-6">
        <PreferencesForm
          mode="user"
          models={models}
          value={settings.preferences}
          fallback={settings.defaults}
          backend={{ value: settings.agentBackend, available: settings.claudeCodeAvailable }}
        />
      </div>
    </>
  );
}
