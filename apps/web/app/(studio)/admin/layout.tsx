import { notFound } from "next/navigation";
import { AdminTabs } from "@/components/admin/admin-tabs";
import { PageHeader } from "@/components/layout/page-header";
import { readSessionUser } from "@/lib/server-api";

/** The admin area: hidden (404) from anyone else; the API refuses them anyway. */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await readSessionUser();
  if (user?.role !== "admin") notFound();

  return (
    <>
      <PageHeader
        title="Administration"
        description="Les modèles proposés aux utilisateurs, les choix par défaut de la plateforme et ce que coûtent les générations."
      />
      <div className="px-4 lg:px-6">
        <AdminTabs />
      </div>
      {children}
    </>
  );
}
