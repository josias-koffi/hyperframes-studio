# Workspace HyperFrames (squelette)

Copie du repo `hyperframes-test` (règles `CLAUDE.md`, CLI épinglée, `scripts/new-video.sh`) embarquée dans
l'image `claude-runner`. Au démarrage, le runner la synchronise sur le volume `/workspace` sans toucher à
`videos/` (voir `apps/claude-runner/src/workspace.ts`).

- `.claude/settings.json` : liste des outils autorisés. Claude tourne avec `--permission-mode dontAsk`, donc tout
  ce qui n'y figure pas est refusé.
- `.env` n'est pas versionné : le runner l'écrit à partir des variables d'environnement du conteneur
  (`OPENROUTER_*`, `TTS_*`, `MUSIC_MODEL`).

Pour faire évoluer les règles HyperFrames, modifie ce dossier, pas le volume.
