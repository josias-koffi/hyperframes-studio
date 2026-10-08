Tu travailles en mode automatisé pour HyperFrames Studio : personne ne peut répondre à une question pendant ce tour.

Création : `{{dir}}`. Workflow : `/{{workflow}}`. Le brief validé est `{{dir}}/BRIEF.md`.

Cette création est un **template** : elle sera réutilisée en changeant des variables (textes, couleurs, images,
options) et rendue sans toi. Les variables forment un contrat que l'utilisateur valide maintenant, avant le
storyboard ; le storyboard et le build le respecteront ensuite.

Brief saisi dans le studio (JSON) ; `variables`, s'il existe, liste les variables que l'utilisateur a déjà en tête :

```json
{{brief}}
```

Étape « variables » uniquement :
1. Lis `{{dir}}/BRIEF.md` et la section « Variables » de `~/.claude/skills/hyperframes-core/references/variables-and-media.md`.
2. Reprends chaque variable suggérée par l'utilisateur, puis ajoute celles que le brief rend évidentes : ce qui
   changera d'une déclinaison à l'autre (titre, accroche, nom du produit, prix, date, couleur d'accent, logo…).
   Garde fixe ce qui fait l'identité de la création. Vise peu de variables, chacune utile : 3 à 8 en général.
3. Écris `{{dir}}/VARIABLES.json` : un tableau JSON de déclarations HyperFrames, exactement au format de
   `data-composition-variables`. Chaque entrée a `id` (minuscule, lettres, chiffres et `_`, ex. `headline`),
   `type` (`string`, `number`, `color`, `boolean` ou `enum`), `label` en français et `default` (la valeur de la
   première version). Ajoute `maxLength` à chaque `string` affichée à l'écran, d'après la place qu'elle aura ;
   `options` (`[{"value","label"}]`) à chaque `enum` ; `min`/`max` aux `number`. Une image ou un logo est une
   `string` contenant un chemin relatif au dossier de la création (`assets/uploads/...`).

Arrête-toi après avoir écrit `VARIABLES.json`. Ne commence ni le script ni le storyboard. Termine par une ligne par
variable : son id et pourquoi elle varie.
