"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { SidebarMenu, SidebarMenuItem } from "@/components/ui/sidebar";
import type { SessionUser } from "@/lib/server-api";

/** Who the studio works for on this machine, at the foot of the sidebar. */
export function NavUser({ user }: { user: SessionUser }) {
  return (
    <SidebarMenu>
      <SidebarMenuItem className="flex items-center gap-2 p-2">
        <Avatar className="size-8 rounded-lg">
          <AvatarFallback className="rounded-lg">{user.email.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="grid flex-1 text-left text-sm leading-tight">
          <span className="truncate font-medium">{user.email}</span>
          <span className="truncate text-xs text-muted-foreground">Sur ce poste</span>
        </div>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
