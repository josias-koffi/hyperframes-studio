# HyperFrames Studio

Monorepo pnpm + turbo, livré comme application de bureau Electron (`apps/desktop`) : tout tourne sur le poste, sans
serveur. NestJS 11 + Drizzle sur PGlite (`packages/db`), Next.js 16 + shadcn/ui (`apps/web`), vitest. L'API et les
workers tournent dans un seul processus (`apps/desktop/src/core.ts`) : file de jobs en mémoire, fichiers sur disque.

- Les paquets `packages/*` se compilent vers `dist/` (CommonJS). Lance `pnpm build` avant les tests des apps.
- Schéma DB : modifier `packages/db/src/schema.ts`, puis `pnpm db:generate` (ne jamais éditer une migration générée).
- Règles HyperFrames vues par les agents : `workspace/` (synchronisé dans le workspace au démarrage), jamais la copie.
- Prompts des étapes : `prompts/<étape>.md`. Un placeholder inconnu fait échouer le job (test `prompt.test.ts`).
- Next.js 16 diffère de ce que tu connais : lis `apps/web/node_modules/next/dist/docs/` avant d'écrire du code web.
- Ne jamais lancer de vrai job Claude dans les tests : utiliser `apps/claude-runner/test/fake-claude.mjs`.

Vérifier avant de rendre : `pnpm lint && pnpm typecheck && pnpm test`.
