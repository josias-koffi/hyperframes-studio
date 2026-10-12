
---

Format de la création : **vidéo réaliste** de {{width}}×{{height}} px, {{duration}} secondes, assemblée par le studio
depuis `{{dir}}/STORYBOARD.json` (moteur blocs).
- Les plans filmés sont générés : `{{dir}}/assets/shots/<scène>.mp4` (vidéo) et `.png` (image clé). Ne les régénère
  pas et ne les modifie pas : les plans se refont depuis la revue des étapes « images clés » et « plans ».
- `index.html` et `compositions/scenes/*.html` sont régénérés à chaque build : une retouche durable passe par
  `STORYBOARD.json` (props, ordre, durées, `overlays`). Garde `data-width="{{width}}"` et `data-height="{{height}}"`
  sur la racine.
- Éditable : nomme chaque clip et chaque texte affiché en français avec `data-label`, et garde les textes en texte
  simple.
