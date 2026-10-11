# Prompts des étapes

Un fichier par étape de génération, lu par `apps/claude-runner` (`buildPrompt`). Placeholders :
`{{slug}}`, `{{dir}}` (`videos/<slug>`), `{{workflow}}` (skill HyperFrames de la création), `{{brief}}` (JSON du
formulaire), `{{campaign}}` (nom et contexte du projet), `{{step}}`, `{{feedback}}` (`feedback.md` uniquement),
et le format de la création : `{{type}}`, `{{width}}`, `{{height}}`, `{{duration}}`, `{{slides}}` (vides quand ils
ne s'appliquent pas). Un placeholder inconnu fait échouer le job.

Chaque prompt reçoit le format de sa création, ajouté à la fin : `partials/video.md`, `partials/carousel.md`,
`partials/image.md`, ou `partials/video-source.md` pour une vidéo sans cadre imposé (rushs fournis). Pour une
création de type template, `partials/template.md` (le contrat `VARIABLES.json`) est ajouté aux prompts
`storyboard`, `build` et `feedback`. L'étape `footage` (analyse des rushs, `workspace/scripts/footage.mjs`)
n'existe que pour une vidéo dont le brief a un champ `footage`, `variables` que pour un template, `media` que pour
une vidéo, `storyboard` pour une vidéo ou un carrousel. Le brief d'une image ou d'un carrousel peut nommer ses
images de fond (`backgrounds`, noms de fichiers dans `assets/uploads/`) : `partials/image.md` et
`partials/carousel.md` disent à Claude de s'en servir.

Chaque prompt se termine sur une **consigne d'arrêt** : le studio, pas Claude, décide de la suite (checkpoint de
validation ou étape suivante). Les règles HyperFrames restent dans les skills et le `CLAUDE.md` du workspace.

**Moteur blocs.** Une création dont le brief porte `engine: "blocks"` n'utilise aucun de ces fichiers : le brief
(`BRIEF.json`, puis `BRIEF.md` généré), les variables d'un template (`VARIABLES.json`) et le storyboard
(`STORYBOARD.json`, à partir du catalogue de `workspace/blocks/`) sont des appels structurés du runner
(`apps/claude-runner/src/blocks.ts`, prompts écrits dans le code). Deux réponses refusées font passer l'appel au
modèle d'escalade. Les médias passent directement par `scripts/audio.mjs` et le build est assemblé par
`assembleVideo` (`packages/shared/src/storyboard.ts`) ; un `check` en échec renvoie sa sortie au modèle, qui corrige
les props, et le second échec passe au modèle d'escalade. Seule une
scène `custom` passe par un agent, avec un prompt écrit dans le code (`customScenePrompt`, même fichier que le runner).
