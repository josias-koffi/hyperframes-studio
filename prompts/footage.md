Tu travailles en mode automatisé pour HyperFrames Studio : personne ne peut répondre à une question pendant ce tour.

Création : `{{dir}}`. Le brief validé est `{{dir}}/BRIEF.md`, son champ `footage` est le rush fourni par
l'utilisateur. Les graphismes de la vidéo seront posés par-dessus : il faut savoir ce qui s'y passe et quand.

Étape « analyse des rushs » uniquement. Tu ne vois pas la vidéo, seulement des images : prépare-les avec le script
du workspace (sans `cd`, depuis la racine) :

```
node scripts/footage.mjs {{dir}}
```

Il écrit `{{dir}}/footage_map.json` (cadre et durée, plans détectés, planches, mots transcrits) et les images de
`{{dir}}/footage/`. Si une sous-étape échoue, relance-la seule avec `--steps probe`, `cuts`, `sheets` ou
`transcribe`. N'écris pas d'autre script d'analyse.

1. Lis chaque planche de `sheets` et l'image de chaque plan de `shots`. Une planche se lit ligne par ligne, de
   gauche à droite ; l'instant exact de chaque tuile est dans son tableau `times`, dans le même ordre. Ne déduis
   jamais un instant de la position d'une tuile sans lire `times`.
2. Les coupes franches sont dans `shots`, mais un fondu enchaîné n'y figure pas : repère-le sur les planches.
3. Pour chaque début ou fin d'événement sur lequel un graphisme se calera (apparition d'un produit, geste, entrée
   d'une personne, texte incrusté), resserre la fenêtre entre les deux tuiles qui l'encadrent :
   `node scripts/footage.mjs {{dir}} --refine <début>-<fin>` (10 images par seconde, ajoutées à `refines`).
   Sans resserrement, l'incertitude d'un instant est d'un intervalle de planche.
4. `words` vient de whisper, qui invente des phrases sur de la musique ou du silence. Garde la transcription si les
   images la rendent plausible (quelqu'un parle, voix off cohérente avec le propos) ; sinon, écris-le dans
   `FOOTAGE.md` et ignore-la.
5. Complète `events` dans `{{dir}}/footage_map.json` sans toucher aux autres champs : un objet par moment utile,
   `{ "id": "e1", "start": 3.2, "end": 6.0, "description": "…", "subjects": ["…"], "free_zones": ["haut droite"],
   "camera": "fixe" | "mouvement", "precision_s": 0.1 | 0.5, "confidence": "haute" | "moyenne" | "basse" }`.
6. Écris `{{dir}}/FOOTAGE.md`, en français, pour l'utilisateur qui validera ces repères :
   - un tableau des moments : timecode, ce qu'on voit, ce qui est dit, précision ;
   - les zones libres où poser des graphismes sans masquer le sujet, plan par plan ;
   - la caméra (fixe, panoramique, à la main) et ce que cela permet : un graphisme qui suit un objet en
     mouvement n'est pas calculé automatiquement ;
   - les risques : texte déjà incrusté, mouvements rapides, faible contraste, fondus ;
   - ce dont tu n'es pas sûr, pour que l'utilisateur corrige.

Cette étape est un checkpoint du studio : l'utilisateur relira les repères dans l'interface et pourra les corriger
en commentaire. Arrête-toi là, sans écrire de storyboard ni de composition. Termine par la durée du rush, le
nombre de plans et une ligne par événement.
