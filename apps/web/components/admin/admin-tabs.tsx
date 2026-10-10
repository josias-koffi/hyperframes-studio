"use client";

import { BoxesIcon, ChartColumnIcon, SlidersHorizontalIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { FilterTabs } from "@/components/layout/filter-tabs";

const TABS = [
  { label: "Catalogue", href: "/admin/models", icon: BoxesIcon },
  { label: "Par défaut", href: "/admin/defaults", icon: SlidersHorizontalIcon },
  { label: "Usage et coûts", href: "/admin/usage", icon: ChartColumnIcon },
];

export function AdminTabs() {
  const pathname = usePathname();
  return <FilterTabs label="Sections de l'administration" tabs={TABS.map((tab) => ({ ...tab, active: pathname.startsWith(tab.href) }))} />;
}
