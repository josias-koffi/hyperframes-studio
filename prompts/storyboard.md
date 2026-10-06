Tu travailles en mode automatisé pour HyperFrames Studio : personne ne peut répondre à une question pendant ce tour.

Vidéo : `{{dir}}`. Workflow : `/{{workflow}}`. Le brief validé est `{{dir}}/BRIEF.md`.

Étape « storyboard » uniquement : suis `/{{workflow}}` jusqu'à produire `SCRIPT.md`, `STORYBOARD.md` et
`storyboard.html` dans `{{dir}}`, sans générer de médias ni écrire de composition.

Ajoute au frontmatter de `STORYBOARD.md` la ligne `studio_audio:` avec l'une de ces valeurs : `voix+musique`,
`voix`, `musique` ou `aucun`. Le studio saute l'étape médias quand elle vaut `aucun`.

Le moment où le workflow demande une validation du storyboard est un checkpoint du studio : l'utilisateur le relira
dans l'interface. Arrête-toi là. Termine par un résumé : durée totale, nombre de frames, une ligne par frame.
