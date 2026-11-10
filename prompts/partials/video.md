
---

Format de la création : **vidéo** de {{width}}×{{height}} px, {{duration}} secondes.
- Brief : reporte ce cadre et cette durée dans `BRIEF.md`.
- Storyboard : produis `SCRIPT.md`, `STORYBOARD.md` et `storyboard.html`. `SCRIPT.md` a un titre
  `## <titre> (Frame N)` par frame, suivi du texte parlé indenté de 4 espaces : `scripts/audio.mjs` le lit tel quel.
  Ajoute au frontmatter de `STORYBOARD.md` la ligne `studio_audio:` avec l'une de ces valeurs : `voix+musique`,
  `voix`, `musique` ou `aucun`. Le studio saute l'étape médias quand elle vaut `aucun`.
- Build : la racine de `{{dir}}/index.html` garde `data-width="{{width}}"` et `data-height="{{height}}"`. Prends les
  snapshots de contrôle au milieu de chaque frame. Cale la durée de chaque frame sur sa voix
  (`audio_meta.json`).
- Éditable : l'utilisateur retouche ensuite la vidéo dans l'éditeur (timeline, textes). Nomme chaque clip et chaque
  texte affiché en français avec `data-label` (« Titre », « Sous-titre »…), et garde les textes en texte simple.
