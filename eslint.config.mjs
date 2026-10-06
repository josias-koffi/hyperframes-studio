import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

/** Shared flat config for the Node packages; apps/web keeps its own Next.js config. */
export default tseslint.config(
  { ignores: ["**/dist/**", "**/.next/**", "**/coverage/**", "**/node_modules/**", "apps/web/**", "workspace/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,js,mjs,cjs}"],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
);
