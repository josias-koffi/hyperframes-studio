
---

Cette création est un **template**. `{{dir}}/VARIABLES.json` est le contrat de variables validé par l'utilisateur ;
ne le modifie pas, sauf si sa demande porte explicitement sur les variables.
- Storyboard : prévois la place de chaque variable affichée (sa `maxLength`, pas seulement sa valeur par défaut) et
  signale dans `STORYBOARD.md` quelle frame ou quelle slide utilise quelle variable.
- Build : déclare le contenu de `VARIABLES.json` tel quel dans `data-composition-variables` sur le `<html>` de
  `{{dir}}/index.html`, puis lie chaque variable avec `data-var-text`, `data-var-src` ou `var(--<id>)`, selon
  `hyperframes-core/references/variables-and-media.md`. N'écris jamais en dur une valeur qui est une variable. Le
  studio compare la déclaration au contrat après le build.
