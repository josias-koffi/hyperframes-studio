import { loadEnvironmentFiles } from "@studio/shared";
import { runMigrations } from "./client";

loadEnvironmentFiles();

/** Container entrypoint step of the API: a failed migration keeps the new version from starting. */
runMigrations()
  .then((folder) => console.log(`[migrate] migrations applied from ${folder}`))
  .catch((error: unknown) => {
    console.error("[migrate] failed", error);
    process.exit(1);
  });
