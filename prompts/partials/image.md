
---

Format de la création : **image fixe** de {{width}}×{{height}} px (visuel de post, bannière, affiche). Pas de
storyboard, pas de voix, pas de musique : le studio la capture en PNG.
- Brief : `BRIEF.md` décrit le message, la hiérarchie des textes (accroche, texte secondaire, appel à l'action) et
  le visuel attendu.
- Build : une seule composition, `{{dir}}/index.html`, dont la racine porte `data-duration="1"`,
  `data-width="{{width}}"` et `data-height="{{height}}"`, avec un fond opaque. Le studio la capture à `0.5`
  seconde : tout doit y être en place et immobile. Prends le snapshot de contrôle à `0.5`. Les avertissements de
  `check` sur l'absence de mouvement sont acceptables.
