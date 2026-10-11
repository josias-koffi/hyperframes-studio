
---

Format de la création : **carrousel** de {{slides}} slides fixes, {{width}}×{{height}} px, pour un post LinkedIn ou
Instagram. Le studio en tire une image PNG par slide et un PDF qui les assemble. Pas de voix, pas de musique.
- Brief : `BRIEF.md` décrit l'objectif du carrousel, le message de chaque slide et l'appel à l'action de la
  dernière. La première slide accroche, chaque slide porte une seule idée lisible en deux secondes.
- Storyboard : `STORYBOARD.md` liste les {{slides}} slides (numéro, titre, texte exact, visuel) et `storyboard.html`
  les montre en grille. Pas de `SCRIPT.md` ni de ligne `studio_audio`.
- Fonds fournis : si le brief a un champ `backgrounds` (à recopier dans `BRIEF.md`), ce sont des images de
  `{{dir}}/assets/uploads/` à utiliser comme fond de slide ou comme remplissage de formes
  (`background-image: url(assets/uploads/<fichier>)` avec `background-size: cover`, ou un `<img>` plein cadre en
  calque « Fond »). Un seul fond sert à toutes les slides ; plusieurs sont répartis dans l'ordre, sauf si les notes
  du brief en disent autrement. Le storyboard indique le fond de chaque slide. Ne les remplace pas par des visuels
  inventés.
- Build : une seule composition, `{{dir}}/index.html`, dont la racine porte `data-duration="{{slides}}"`,
  `data-width="{{width}}"` et `data-height="{{height}}"`. La slide `n` (numérotée à partir de 0) est un clip plein
  cadre `data-start="n" data-duration="1"`, avec un fond opaque (couleur, ou image qui couvre tout) : le studio la
  capture à `n + 0.5` secondes, tout doit y être en place et immobile (une éventuelle animation d'entrée se termine
  avant `n + 0.4`). Garde le texte dans les marges de sécurité et une identité visuelle commune à toutes les slides.
  Prends les snapshots de contrôle à `0.5,1.5,…` jusqu'à la dernière slide. Les avertissements de `check` sur l'absence de mouvement sont acceptables.
- Éditable : l'utilisateur retouche ensuite chaque élément à la main dans l'éditeur (calques, propriétés). Chaque
  texte, image, logo ou forme est un élément à part, nommé en français par `data-label` (« Titre », « Logo »…),
  positionné en absolu dans sa slide ; les textes restent du texte, les images des `<img>`.
