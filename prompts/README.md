# Prompts des étapes

Un fichier par étape de génération, lu par `apps/claude-runner` (`buildPrompt`). Placeholders :
`{{slug}}`, `{{dir}}` (`videos/<slug>`), `{{workflow}}` (skill HyperFrames du projet), `{{brief}}` (JSON du
formulaire), `{{step}}`, `{{feedback}}` (`feedback.md` uniquement). Un placeholder inconnu fait échouer le job.

Chaque prompt se termine sur une **consigne d'arrêt** : le studio, pas Claude, décide de la suite (checkpoint de
validation ou étape suivante). Les règles HyperFrames restent dans les skills et le `CLAUDE.md` du workspace.
