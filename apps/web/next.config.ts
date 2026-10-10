import type { NextConfig } from "next";

/** Screens of a création, which used to live right under its project (a project was one video). */
const STEPS = "brief|variables|storyboard|media|build|exports|studio|iterations";

const nextConfig: NextConfig = {
  transpilePackages: ["@studio/shared"],
  // A project migrated to créations kept its id for its only création: old links still land on it.
  redirects() {
    return [
      { source: `/projects/:id/:step(${STEPS})/:rest*`, destination: "/projects/:id/creations/:id/:step/:rest*", permanent: false },
      { source: "/templates/:id((?!new$)[^/]+)/:rest*", destination: "/projects/:id/creations/:id/:rest*", permanent: false },
      { source: "/projects/new", destination: "/creations/new", permanent: false },
      { source: "/templates/new", destination: "/creations/new?kind=template", permanent: false },
    ];
  },
};

export default nextConfig;
