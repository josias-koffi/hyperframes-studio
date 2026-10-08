Tu travailles en mode automatisé pour HyperFrames Studio : personne ne peut répondre à une question pendant ce tour.

Création : `{{dir}}` (dossier déjà créé). Workflow : `/{{workflow}}`.

Elle fait partie de cette campagne, dont elle reprend le ton et le message :

> {{campaign}}

Brief saisi dans le studio (JSON) :

```json
{{brief}}
```

Étape « brief » uniquement :
1. Invoque `/hyperframes`, puis le workflow `/{{workflow}}`, pour connaître le format attendu de `BRIEF.md`.
2. Écris `{{dir}}/BRIEF.md` à partir du brief ci-dessus et du format de la création décrit plus bas, avec
   `flow: automation` et `storyboard: yes` dans le frontmatter. Les assets fournis par l'utilisateur sont dans
   `{{dir}}/assets/uploads/`.
3. Si une information manque, choisis la valeur la plus raisonnable et note-la dans une section `## Hypothèses`.

Arrête-toi après avoir écrit `BRIEF.md`. Ne commence ni le script ni le storyboard. Termine par un résumé de trois
lignes.
