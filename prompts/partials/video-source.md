
---

Format de la création : **vidéo**. Si le brief a un champ `footage`, c'est la vidéo source à traiter
(`{{dir}}/assets/uploads/<footage>`) : le cadre et la durée sont les siens. Sinon, reprends ceux de `BRIEF.md`.
- Si `{{dir}}/FOOTAGE.md` existe, ses repères sont validés par l'utilisateur : cale les frames du storyboard et les
  graphismes sur les événements de `{{dir}}/footage_map.json` (timecodes du rush), dans ses zones libres.
- Storyboard : produis `SCRIPT.md`, `STORYBOARD.md` et `storyboard.html`. Ajoute au frontmatter de `STORYBOARD.md`
  la ligne `studio_audio:` avec l'une de ces valeurs : `voix+musique`, `voix`, `musique` ou `aucun`. Le studio saute
  l'étape médias quand elle vaut `aucun`.
- Build : prends les snapshots de contrôle au milieu de chaque frame. Si le workflow recale les durées du storyboard
  sur la voix (`sync-durations`), lance son script depuis la racine du workspace, sans `cd` :
  `node ~/.claude/skills/{{workflow}}/scripts/audio.mjs sync-durations --audio-meta {{dir}}/audio_meta.json --storyboard {{dir}}/STORYBOARD.md`.
- Éditable : l'utilisateur retouche ensuite la vidéo dans l'éditeur (timeline, textes). Nomme chaque clip et chaque
  texte affiché en français avec `data-label` (« Titre », « Sous-titre »…), et garde les textes en texte simple.
