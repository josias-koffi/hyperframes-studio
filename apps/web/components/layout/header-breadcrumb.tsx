"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { useCrumbLabel } from "./crumb-label";

const SEGMENTS: Record<string, string> = {
  projects: "Projets",
  templates: "Templates",
  new: "Nouvelle vidéo",
  assets: "Assets",
  brief: "Brief",
  storyboard: "Storyboard",
  media: "Voix et musique",
  build: "Build",
  exports: "Exports",
  studio: "Studio HyperFrames",
};

/** Derived from the path; an id segment shows the label its page published (the project name). */
export function HeaderBreadcrumb() {
  const segments = usePathname().split("/").filter(Boolean);
  const detail = useCrumbLabel();
  const crumbs = [
    { href: "/", label: "Tableau de bord" },
    ...segments.map((segment, index) => ({
      href: `/${segments.slice(0, index + 1).join("/")}`,
      label: SEGMENTS[segment] ?? detail ?? "Détail",
    })),
  ];

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map((crumb, index) => (
          <Fragment key={crumb.href}>
            {index > 0 && <BreadcrumbSeparator className={index < crumbs.length - 1 ? "hidden sm:block" : undefined} />}
            <BreadcrumbItem className={index < crumbs.length - 1 ? "hidden sm:inline-flex" : undefined}>
              {index === crumbs.length - 1 ? (
                <BreadcrumbPage className="max-w-48 truncate">{crumb.label}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild>
                  <Link href={crumb.href}>{crumb.label}</Link>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
