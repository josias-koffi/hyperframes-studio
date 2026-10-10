import { defineConfig } from "drizzle-kit";

// `pnpm db:generate` only reads the schema: the app migrates its embedded database itself when it starts.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./drizzle",
});
