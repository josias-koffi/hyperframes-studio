import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { HeaderBreadcrumb } from "./header-breadcrumb";

/** Same bar as shadcn-admin-kit's layout: trigger and breadcrumb. Theme and refresh sit in the window bar above. */
export function SiteHeader() {
  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
        <HeaderBreadcrumb />
      </div>
    </header>
  );
}
