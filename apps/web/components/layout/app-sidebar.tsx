"use client";

import { BookOpenIcon, FolderKanbanIcon, FolderOpenIcon, LayoutDashboardIcon, LayoutTemplateIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brand } from "@/components/brand";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const ITEMS = [
  { href: "/", icon: LayoutDashboardIcon, title: "Tableau de bord" },
  { href: "/projects", icon: FolderKanbanIcon, title: "Projets" },
  { href: "/templates", icon: LayoutTemplateIcon, title: "Templates" },
  { href: "/assets", icon: FolderOpenIcon, title: "Assets" },
];

type AppSidebarProps = React.ComponentProps<typeof Sidebar> & {
  /** One-shot créations whose checkpoint waits for the user. */
  reviewCount: number;
  /** Templates whose checkpoint waits for the user. */
  templateReviewCount: number;
  /** Créations Claude or a render is working on right now. */
  liveCount: number;
};

export function AppSidebar({ reviewCount, templateReviewCount, liveCount, ...props }: AppSidebarProps) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || (pathname.startsWith(`${href}/`) && !pathname.endsWith("/new"));

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem className="px-1.5 py-1 group-data-[collapsible=icon]:px-0.5">
            <Brand />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent className="flex flex-col gap-3">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  tooltip="Nouvelle création"
                  isActive={pathname === "/creations/new"}
                  className="bg-primary text-primary-foreground shadow-surface hover:bg-primary/90 hover:text-primary-foreground hover:shadow-raised active:bg-primary/90 active:text-primary-foreground data-active:bg-primary data-active:text-primary-foreground"
                >
                  <Link href="/creations/new">
                    <PlusIcon />
                    <span>Nouvelle création</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
            <SidebarMenu>
              {ITEMS.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={isActive(item.href)} tooltip={item.title}>
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                  {(() => {
                    const count = item.href === "/projects" ? reviewCount : item.href === "/templates" ? templateReviewCount : 0;
                    return (
                      count > 0 && (
                        <SidebarMenuBadge title={`${count} à valider`} className="bg-warning/15 text-warning peer-hover/menu-button:text-warning">
                          {count}
                        </SidebarMenuBadge>
                      )
                    );
                  })()}
                  {item.href === "/" && liveCount > 0 && (
                    <SidebarMenuBadge title={`${liveCount} en cours`} className="gap-1.5">
                      <span className="rec-dot size-1.5" />
                      {liveCount}
                    </SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Documentation HyperFrames" className="text-muted-foreground">
              <a href="https://hyperframes.heygen.com" target="_blank" rel="noreferrer">
                <BookOpenIcon />
                <span>Documentation HyperFrames</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
