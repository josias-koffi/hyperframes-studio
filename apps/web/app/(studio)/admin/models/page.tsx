import type { Metadata } from "next";
import { ModelsCatalog } from "@/components/admin/models-catalog";
import type { AiModel } from "@/lib/api";
import { serverApi } from "@/lib/server-api";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Catalogue des modèles" };

export default async function AdminModelsPage() {
  const models = await serverApi<AiModel[]>("/admin/ai-models");
  return (
    <div className="px-4 lg:px-6">
      <ModelsCatalog models={models} />
    </div>
  );
}
