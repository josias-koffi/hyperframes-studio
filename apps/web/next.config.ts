import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone server for the Docker image (docker/web.Dockerfile).
  output: "standalone",
  outputFileTracingRoot: new URL("../../", import.meta.url).pathname,
  transpilePackages: ["@studio/shared"],
};

export default nextConfig;
