import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { NewProjectForm } from "@/components/studio/new-project-form";

export const metadata: Metadata = { title: "Nouvelle vidéo" };

export default function NewProjectPage() {
  return (
    <>
      <PageHeader
        title="Nouvelle vidéo"
        description="Décris la vidéo : Claude rédige ensuite le brief et le storyboard, que tu valides avant le montage."
      />
      <div className="mx-auto w-full max-w-4xl px-4 lg:px-6">
        <NewProjectForm />
      </div>
    </>
  );
}
