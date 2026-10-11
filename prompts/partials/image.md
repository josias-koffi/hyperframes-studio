
---

Format de la création : **image fixe** de {{width}}×{{height}} px (visuel de post, bannière, affiche). Pas de
storyboard, pas de voix, pas de musique : le studio la capture en PNG.
- Brief : `BRIEF.md` décrit le message, la hiérarchie des textes (accroche, texte secondaire, appel à l'action) et
  le visuel attendu.
- Fonds fournis : si le brief a un champ `backgrounds` (à recopier dans `BRIEF.md`), ce sont des images de
  `{{dir}}/assets/uploads/` à utiliser comme fond ou comme remplissage de formes
  (`background-image: url(assets/uploads/<fichier>)` avec `background-size: cover`, ou un `<img>` plein cadre en
  calque « Fond »). Ne les remplace pas par des visuels inventés.
- Build : une seule composition, `{{dir}}/index.html`, dont la racine porte `data-duration="1"`,
  `data-width="{{width}}"` et `data-height="{{height}}"`, avec un fond opaque (couleur, ou image qui couvre tout).
  Le studio la capture à `0.5` seconde : tout doit y être en place et immobile. Prends le snapshot de contrôle à
  `0.5`. Les avertissements de `check` sur l'absence de mouvement sont acceptables.
- Éditable : l'utilisateur retouche ensuite chaque élément à la main dans l'éditeur (calques, propriétés). Chaque
  texte, image, logo ou forme est un élément à part, nommé en français par `data-label` (« Titre », « Logo »…),
  positionné en absolu dans la racine ; les textes restent du texte, les images des `<img>`.
