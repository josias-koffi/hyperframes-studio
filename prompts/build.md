Tu travailles en mode automatisé pour HyperFrames Studio : personne ne peut répondre à une question pendant ce tour.

Création : `{{dir}}`. Le brief et, s'il existe, le storyboard sont validés.

Étape « build » : construis les compositions selon `/{{workflow}}` et le format de la création décrit plus bas,
toi-même : les sous-agents sont désactivés dans le studio, même si le workflow propose des workers en parallèle.
Lance `npm run check -- {{dir}}` et corrige jusqu'à zéro erreur. Prends enfin une planche de snapshots aux instants
indiqués plus bas avec `npx hyperframes snapshot {{dir}} --at <t1>,<t2>,…` : le studio affiche
`{{dir}}/snapshots/contact-sheet.jpg` pour la relecture.

Lance `check` et `snapshot` au premier plan et attends leur sortie, jamais en arrière-plan : ce tour s'arrête dès
que tu rends la main, et rien ne te réveillera à la fin d'une commande lancée en arrière-plan.

Ne lance pas de rendu : le studio s'en charge. Arrête-toi quand `check` a passé. Termine par son résultat, puis la
liste des avertissements restants, s'il y en a.
