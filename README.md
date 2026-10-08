# HyperFrames Studio

Studio web pour produire des vidéos, des carrousels et des images HyperFrames sans passer par le terminal : projets
de campagne, assets, templates, génération par **la session Claude Code du serveur** (abonnement, pas l'API),
exports MP4, PNG et PDF, puis publication via Postiz (lot 5).

```
web (Next.js + shadcn) ──/api proxy──▶ api (NestJS) ──BullMQ──▶ claude-runner ──▶ claude -p … --resume
                                          │   ▲ SSE                 │  (stream-json → events)
                                          │   └── Redis pub/sub ◀───┤
                                          ▼                         ▼
                                   Postgres · MinIO          /workspace/videos/<slug>  ◀── render-worker
                                                                  (volume partagé)          (hyperframes render)
```

## Comment ça marche

- **Un projet = une campagne** (`projects` : nom, contexte partagé, assets communs) qui contient des **créations**
  (`creations`). **Une création = un dossier `videos/<slug>`** du workspace HyperFrames (squelette dans
  [`workspace/`](workspace/), copie de `hyperframes-test` : `CLAUDE.md`, CLI épinglée, scripts), une session Claude et
  un livrable selon son **type** :
  - `video` : cadre et durée au choix (ou ceux des rushs fournis), rendu MP4 ;
  - `carousel` : N slides fixes, une composition de N secondes dont la slide `i` est capturée à `i + 0.5` s,
    livrée en PNG (`slide-01.png`…) plus un PDF assemblé par le render-worker (`pdf-lib`) ;
  - `image` : une composition d'une seconde capturée à 0.5 s, livrée en PNG.
  Les formats (9:16, 4:5, 1:1, 16:9) sont dans `packages/shared/src/creations.ts`. Le runner taille le canvas à la
  création du dossier (`setCanvasSize`) et chaque prompt reçoit le format de sa création (`prompts/partials/<type>.md`).
- **Génération par étapes** (cadrage conservé) : `brief → (variables ✓) → storyboard ✓ → media → build ✓` pour une
  vidéo, sans `media` pour un carrousel (le storyboard y est le plan des slides), `brief → (variables ✓) → build ✓`
  pour une image (`stepsFor` dans `packages/shared/src/jobs.ts`). Chaque étape est un tour
  `claude -p --output-format stream-json`, avec le prompt de [`prompts/<étape>.md`](prompts/). Les étapes ✓ sont des
  **checkpoints** : l'UI affiche le storyboard ou la composition. *Valider* lance l'étape suivante ; *Envoyer le
  retour* reprend la même session (`--resume`) sur la même étape. Un commit git par étape dans le workspace.
- **Création unique ou template, choisi à la création** (`creations.kind`), quel que soit le type. Un template ajoute l'étape `variables ✓` après
  le brief : Claude écrit `VARIABLES.json` (déclarations HyperFrames), l'utilisateur la corrige et la valide, puis le
  storyboard et le build la respectent (`prompts/partials/template.md`) et le runner vérifie que `index.html` la
  déclare. Le template s'utilise ensuite en **itérations** (table `iterations`) : un jeu de valeurs nommé, enregistré,
  et ses rendus, sans Claude, via `hyperframes render --variables-file --strict-variables`. Les images passent par
  `snapshot --at`, sur une copie dont les valeurs par défaut sont réécrites (`applyVariableDefaults`).
- **Claude sans prompt de permission** : `--permission-mode dontAsk` + liste blanche dans
  [`workspace/.claude/settings.json`](workspace/.claude/settings.json). Un seul job Claude à la fois.

## Structure

```
apps/web             Next.js 16 + shadcn/ui (radix-nova) — projets, créations par type, templates et itérations, revue, exports
apps/api             NestJS 11 — projets, créations, variables, itérations, jobs (SSE), assets (URL présignées MinIO), rendus
apps/claude-runner   worker BullMQ « studio-claude » : lance Claude Code, diffuse les événements
apps/render-worker   worker BullMQ « studio-render » : hyperframes render / snapshot (+ PDF des carrousels) → MinIO
packages/shared      types, schémas zod, files, parseur stream-json, variables HyperFrames
packages/db          schéma Drizzle + migrations + reporter de jobs
packages/storage     client S3/MinIO + clés d'objets
prompts/             un prompt par étape
workspace/           squelette du workspace HyperFrames (copié dans l'image claude-runner)
docker/              une image par app
.deploy/manifest.yaml  déploiement josias-koffi/infra (Dokploy, mode services)
```

## Développement local

```bash
cp .env.example .env
pnpm install
pnpm infra:up            # postgres :5447, redis :6390, minio :9120 (console :9121)
pnpm build && pnpm db:migrate
pnpm dev                 # web :3010, api :3343, workers
```

Le runner utilise la commande `claude` de la machine (session déjà connectée) quand `CLAUDE_CODE_OAUTH_TOKEN` est
vide. Pour tester sans consommer de quota :
`CLAUDE_BIN=$PWD/apps/claude-runner/test/fake-claude.mjs`.

Vérifications : `pnpm lint && pnpm typecheck && pnpm test`.

## Déploiement

Standard [`infra`](../infra) : `.deploy/manifest.yaml` (validé par `infra/scripts/validate-manifest.py`) et
`.github/workflows/deploy.yml`. Staging sur `develop` (auto), production sur `main` (manuel).

1. Remplacer `<domaine>` dans le manifest.
2. `infra/scripts/set-secrets.sh --app josias-koffi/hyperframes-studio`, puis `infra/scripts/init-app-env.sh`.
3. `CLAUDE_CODE_OAUTH_TOKEN` : sortie de `claude setup-token` sur le serveur (abonnement, usage interne).

## Reste à faire

- **Authentification** (lot 1) : à brancher dans le proxy `apps/web/app/api/[...path]` avant tout déploiement
  (l'API n'a aucune protection pour l'instant).
- **Lot 0 sur le VPS** : construire l'image `claude-runner`, vérifier `CLAUDE_CODE_OAUTH_TOKEN`, les skills
  installés, la liste blanche des outils et `--resume` après redéploiement (volume `claude_sessions`).
- Vérifier le nom d'hôte interne du composant `minio` (`S3_ENDPOINT`) sur Dokploy.
- MinIO ne publie plus d'image communautaire récente : image figée `RELEASE.2025-04-22`. Garder cette version ou
  passer sur une alternative S3 (Garage, SeaweedFS) plus tard.
- Les skills HyperFrames installés dans l'image suivent la dernière version (`skills update`) : pas encore figés.
- Upload d'assets dans l'UI (l'API fournit déjà l'URL présignée), marques et design systems, Postiz (lot 5).
