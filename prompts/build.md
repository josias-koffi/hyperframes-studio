Tu travailles en mode automatisé pour HyperFrames Studio : personne ne peut répondre à une question pendant ce tour.

Vidéo : `{{dir}}`. Le storyboard et les médias sont prêts.

Étape « build » : construis les compositions selon `/{{workflow}}` et le storyboard verrouillé, toi-même et
frame par frame : les sous-agents sont désactivés dans le studio, même si le workflow propose des workers en
parallèle. Lance `npm run check -- {{dir}}` et corrige jusqu'à zéro erreur. Prends enfin une planche de snapshots
au milieu de chaque frame avec `npx hyperframes snapshot {{dir}} --at <t1>,<t2>,…` : le studio affiche
`{{dir}}/snapshots/contact-sheet.jpg` pour la relecture.

Si le workflow recale les durées du storyboard sur la voix (`sync-durations`), lance son script depuis la racine du
workspace, sans `cd` :
`node ~/.claude/skills/{{workflow}}/scripts/audio.mjs sync-durations --audio-meta {{dir}}/audio_meta.json --storyboard {{dir}}/STORYBOARD.md`.

Ne lance pas de rendu : le studio s'en charge. Arrête-toi quand `check` passe. Termine par la liste des
avertissements restants, s'il y en a.
