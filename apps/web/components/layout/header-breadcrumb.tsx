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
import { useCrumbLabels } from "./crumb-label";

const SEGMENTS: Record<string, string> = {
  projects: "Projets",
  templates: "Templates",
  new: "Nouvelle création",
  assets: "Assets",
  brief: "Brief",
  variables: "Variables",
  iterations: "Itérations",
  footage: "Analyse des rushs",
  storyboard: "Storyboard",
  keyframes: "Images clés",
  shots: "Plans",
  media: "Voix et musique",
  build: "Build",
  exports: "Exports",
  studio: "Studio HyperFrames",
  settings: "Paramètres",
  ai: "Modèles IA",
  admin: "Administration",
  models: "Catalogue des modèles",
  defaults: "Modèles par défaut",
  usage: "Usage et coûts",
};

/** Derived from the path; an id segment shows the label its page published (project, création or iteration name). */
export function HeaderBreadcrumb() {
  const segments = usePathname().split("/").filter(Boolean);
  const labels = useCrumbLabels();
  const crumbs = [
    { href: "/", label: "Tableau de bord" },
    ...segments
      .map((segment, index) => ({
        href: `/${segments.slice(0, index + 1).join("/")}`,
        label: labels[segment] ?? SEGMENTS[segment] ?? "Détail",
        // `/creations` has no page of its own: a project lists its créations.
        hidden: segment === "creations",
      }))
      .filter((crumb) => !crumb.hidden),
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
