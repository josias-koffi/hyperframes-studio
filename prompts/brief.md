Tu travailles en mode automatisé pour HyperFrames Studio : personne ne peut répondre à une question pendant ce tour.

Vidéo : `{{dir}}` (déjà créée). Workflow : `/{{workflow}}`.

Brief saisi dans le studio (JSON) :

```json
{{brief}}
```

Étape « brief » uniquement :
1. Invoque `/hyperframes`, puis le workflow `/{{workflow}}`, pour connaître le format attendu de `BRIEF.md`.
2. Écris `{{dir}}/BRIEF.md` à partir du brief ci-dessus, avec `flow: automation` et `storyboard: yes` dans le
   frontmatter. Les assets fournis par l'utilisateur sont dans `{{dir}}/assets/uploads/`. Si le brief a un champ
   `footage`, c'est la vidéo source à traiter (`{{dir}}/assets/uploads/<footage>`) : le cadre et la durée sont
   les siens, ignore `aspect` et `length`.
3. Si une information manque, choisis la valeur la plus raisonnable et note-la dans une section `## Hypothèses`.

Arrête-toi après avoir écrit `BRIEF.md`. Ne commence ni le script ni le storyboard. Termine par un résumé de trois
lignes.
