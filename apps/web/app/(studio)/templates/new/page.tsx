import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { NewProjectForm } from "@/components/studio/new-project-form";

export const metadata: Metadata = { title: "Nouveau template" };

export default function NewTemplatePage() {
  return (
    <>
      <PageHeader
        title="Nouveau template"
        description="Une vidéo à décliner : après le brief, Claude propose ses variables, tu les valides, puis le storyboard et le montage les respectent."
      />
      <div className="mx-auto w-full max-w-4xl px-4 lg:px-6">
        <NewProjectForm initialKind="template" />
      </div>
    </>
  );
}
