# Banc du moteur blocs

Mesure si un modèle sait écrire des storyboards valides avec les blocs de `workspace/blocks/`. Pour chacun des dix
briefs de `briefs.mjs` (vidéos avec voix, muette avec musique, template, carrousels, images), le banc :

1. demande `STORYBOARD.json` au modèle avec les prompts du runner (`storyboardSystemPrompt`, `storyboardUserPrompt`) ;
2. le valide comme le studio, en 3 essais au plus, les erreurs renvoyées au modèle ;
3. l'assemble (`assembleVideo` ou `assembleStills`) et lance `hyperframes check`, puis les snapshots.

```bash
pnpm build
node scripts/bench-blocks/bench.mjs --model haiku                    # Claude Code (abonnement), via claude -p
node scripts/bench-blocks/bench.mjs --model deepseek/deepseek-v4     # OpenRouter, OPENROUTER_API_KEY requis
node scripts/bench-blocks/bench.mjs --only b06-template-soldes --out /tmp/bench
node scripts/bench-blocks/bench.mjs --model haiku,deepseek/deepseek-v4,qwen/qwen3-coder   # compare les candidats
```

Avec plusieurs modèles, chacun écrit ses résultats dans `--out/<modèle>/`, puis un tableau les compare
(`comparison.md`) : briefs réussis, réussis du premier coup, coût et durée moyenne. Les modèles par défaut des
étapes se choisissent sur ces chiffres. Le banc mesure un modèle seul : pas d'escalade.

Un id avec `/` passe par OpenRouter et la boucle même du runner (`writeStoryboard` : `json_schema`, repli
`json_object`) ; un alias Claude passe par `claude -p`, sans outils, la réponse refusée renvoyée dans le prompt
suivant. Il faut `ffmpeg`, Chrome pour HyperFrames et le réseau (GSAP depuis jsdelivr).

Les médias sont simulés : les fichiers fournis sont des dégradés, la voix off des pistes silencieuses de la durée
des mots, sans musique. Le banc juge le storyboard et l'assemblage, pas le rendu audio.

Résultats dans `--out` (par défaut `$TMPDIR/bench-blocks`) : `results.json` (essais et erreurs, blocs choisis,
coût), `<brief>.check.log`, et la planche `ws/videos/<brief>/snapshots/contact-sheet.jpg` à relire.

Critère de sortie du jalon 1b : 8 briefs sur 10 réussis avec le modèle bon marché (DeepSeek V4).

| Date | Modèle | Réussis | Du premier coup | Coût |
| --- | --- | --- | --- | --- |
| 2026-10-12 | Claude Haiku 5.5 (`claude -p`) | 10/10 | 8 | 0,03 $ |
