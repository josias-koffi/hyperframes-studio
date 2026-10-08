import { ProjectShell } from "@/components/project/project-shell";

export const dynamic = "force-dynamic";

/** A template goes through the same steps as a video, plus its variables and its iterations. */
export default async function TemplateLayout({ children, params }: LayoutProps<"/templates/[id]">) {
  const { id } = await params;
  return (
    <ProjectShell id={id} section="template">
      {children}
    </ProjectShell>
  );
}
