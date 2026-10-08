Tu travailles en mode automatisé pour HyperFrames Studio : personne ne peut répondre à une question pendant ce tour.

Création : `{{dir}}`. Le brief et, s'il existe, le storyboard sont validés.

Étape « build » : construis les compositions selon `/{{workflow}}` et le format de la création décrit plus bas,
toi-même : les sous-agents sont désactivés dans le studio, même si le workflow propose des workers en parallèle.
Lance `npm run check -- {{dir}}` et corrige jusqu'à zéro erreur. Prends enfin une planche de snapshots aux instants
indiqués plus bas avec `npx hyperframes snapshot {{dir}} --at <t1>,<t2>,…` : le studio affiche
`{{dir}}/snapshots/contact-sheet.jpg` pour la relecture.

Ne lance pas de rendu : le studio s'en charge. Arrête-toi quand `check` passe. Termine par la liste des
avertissements restants, s'il y en a.
