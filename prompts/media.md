Tu travailles en mode automatisé pour HyperFrames Studio : personne ne peut répondre à une question pendant ce tour.

Vidéo : `{{dir}}`. Le storyboard de `{{dir}}/STORYBOARD.md` est validé par l'utilisateur.

Étape « médias » uniquement. Produis la voix off et la musique avec le script du workspace, qui appelle les
fournisseurs du `CLAUDE.md` (OpenRouter), normalise la voix et écrit `{{dir}}/audio_meta.json` avec les timings
des mots :

```
node scripts/audio.mjs {{dir}} --music "<prompt anglais : ambiance, tempo, instrumental, sans voix>"
```

Sans musique dans le storyboard, omets `--music`. Sans voix off, ne lance pas le script : pose la musique à la
main dans `assets/audio/music/bgm.mp3`. N'écris pas d'autre script audio. Si une étape échoue, relance-la seule avec
`--steps tts`, `normalize`, `music` ou `meta`.

Arrête-toi quand les fichiers audio sont en place. N'écris aucune composition. Termine par la durée de chaque piste.
