# HyperFrames Studio

Application de bureau (Electron) pour produire des vidéos, des carrousels et des images HyperFrames sans passer par
le terminal : projets de campagne, assets, templates, génération par un agent (Claude Code sur l'abonnement de la
personne, ou OpenCode sur des modèles OpenRouter), exports MP4, PNG et PDF. Tout tourne sur le poste, GPU compris
pour les rendus.

```
fenêtre Electron ──▶ web (Next.js + shadcn) ──/api relais──▶ core : api (NestJS) ──file en mémoire──▶ claude-runner
                                                                   │   ▲ SSE                              │
                                                                   │   └──── canal des événements ◀───────┤
                                                                   ▼                                      ▼
                                                    PGlite · fichiers (dossier)        workspace/videos/<slug> ◀── render-worker
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
  [`workspace/.claude/settings.json`](workspace/.claude/settings.json). Un seul tour Claude Code à la fois.

## Structure

```
apps/desktop         Electron : lance le core, le moteur et le front sur 127.0.0.1, ouvre la fenêtre connectée
apps/web             Next.js 16 + shadcn/ui (radix-nova) — projets, créations par type, templates et itérations, revue, exports
apps/api             NestJS 11 — projets, créations, variables, itérations, jobs (SSE), assets et fichiers (URL signées), rendus
apps/claude-runner   worker « studio-claude » : lance Claude Code ou OpenCode, diffuse les événements
apps/render-worker   worker « studio-render » : hyperframes render / snapshot (+ PDF des carrousels)
apps/hf-studio       moteur de l'éditeur HyperFrames, appelé par l'API
packages/shared      types, schémas zod, files, parseurs d'événements, variables HyperFrames
packages/db          schéma Drizzle + migrations (PGlite), file de jobs en mémoire, reporter de jobs
packages/storage     fichiers sur disque, URL signées + clés
prompts/             un prompt par étape
workspace/           squelette du workspace HyperFrames, synchronisé au démarrage
```

## Lancer l'app

```bash
cp .env.example .env     # clé OpenRouter, HYPERFRAMES_BIN
pnpm install
pnpm desktop             # build, puis Electron
```

Electron lance trois processus sur `127.0.0.1`, sur des ports libres, puis ouvre une fenêtre déjà connectée :

- `core` : l'API et les deux workers dans un seul processus, qui se partagent le Postgres embarqué (PGlite) et la
  file de jobs en mémoire. Un job en cours quand l'app se ferme est marqué en échec au lancement suivant ;
- `hf-studio`, le moteur de l'éditeur ;
- le front Next.js (`next start`).

Les fichiers (uploads, rendus) sont dans un dossier, servis par l'API sous `/files` derrière des URL signées. La
connexion se fait par un jeton tiré à chaque lancement (`GET /auth/desktop`), pour la personne du poste, admin.
Données dans `~/.config/Framesmith` (Linux), `~/Library/Application Support/Framesmith` (macOS) ou
`%APPDATA%\Framesmith`.

**Agents.** Claude Code tourne sur l'abonnement de la personne : la commande `claude` installée et connectée sur le
poste (ou `CLAUDE_CODE_OAUTH_TOKEN`). OpenCode est installé avec l'app (`opencode-ai`) et passe par OpenRouter avec
`OPENROUTER_API_KEY`, que l'agent ne voit jamais : un proxy local lui donne un jeton par job.

## Développement

```bash
pnpm build
pnpm dev                 # web :3010, core :3343 (api + workers, depuis les sources), moteur :3344
```

Puis ouvrir `http://localhost:3010/api/auth/desktop?token=dev` (`DESKTOP_LOGIN_TOKEN` du `.env`). Les données de
dev sont dans `.data/`. Pour tester sans consommer de quota : `CLAUDE_BIN=$PWD/apps/claude-runner/test/fake-claude.mjs`.

Vérifications : `pnpm lint && pnpm typecheck && pnpm test`.

## Reste à faire

- Installateur (electron-builder), avec Node, Chrome et ffmpeg embarqués : l'app tourne aujourd'hui depuis le dépôt
  et demande Node sur le poste (CLI HyperFrames).
- Signature (macOS, Windows) et mises à jour automatiques.
- Catalogue de modèles préchargé : une installation neuve n'en a aucun.
- Clé OpenRouter : celle de la personne, ou un relais avec abonnement.
- Postiz (lot 5).
