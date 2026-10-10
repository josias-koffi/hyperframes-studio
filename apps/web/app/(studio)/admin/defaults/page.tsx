import type { AiPreferences } from "@studio/shared/browser";
import type { Metadata } from "next";
import { PreferencesForm } from "@/components/ai/preferences-form";
import type { AiModel } from "@/lib/api";
import { serverApi } from "@/lib/server-api";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Modèles par défaut" };

/** What every user gets for a slot they leave on « par défaut ». */
export default async function AdminDefaultsPage() {
  const [defaults, models] = await Promise.all([serverApi<AiPreferences>("/admin/ai-defaults"), serverApi<AiModel[]>("/ai-models")]);
  return (
    <div className="mx-auto w-full max-w-4xl px-4 lg:px-6">
      <PreferencesForm mode="defaults" models={models} value={defaults} />
    </div>
  );
}
