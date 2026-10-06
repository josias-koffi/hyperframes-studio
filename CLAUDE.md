# HyperFrames Studio

Monorepo pnpm + turbo. Conventions reprises de cvforge : NestJS 11 + Drizzle (`packages/db`), Next.js 16 +
shadcn/ui (`apps/web`), vitest, une image par app dans `docker/`. Déploiement : standard `~/perso/projets/infra`
(`.deploy/manifest.yaml`, workflow `deploy.yml`), à revalider avec `infra/scripts/validate-manifest.py` après
chaque changement du manifest.

- Les paquets `packages/*` se compilent vers `dist/` (CommonJS). Lance `pnpm build` avant les tests des apps.
- Schéma DB : modifier `packages/db/src/schema.ts`, puis `pnpm db:generate` (ne jamais éditer une migration générée).
- Règles HyperFrames vues par Claude : `workspace/` (copié dans l'image du runner), jamais le volume.
- Prompts des étapes : `prompts/<étape>.md`. Un placeholder inconnu fait échouer le job (test `prompt.test.ts`).
- Next.js 16 diffère de ce que tu connais : lis `apps/web/node_modules/next/dist/docs/` avant d'écrire du code web.
- Ne jamais lancer de vrai job Claude dans les tests : utiliser `apps/claude-runner/test/fake-claude.mjs`.

Vérifier avant de rendre : `pnpm lint && pnpm typecheck && pnpm test`.
