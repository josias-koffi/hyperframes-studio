
---

Bibliothèque d'assets. Le workspace livre des assets libres, consultables sans réseau : personnages, objets, icônes,
drapeaux, appareils (téléphone, laptop, tablette), illustrations et bruitages. Ils rendent mieux qu'un dessin en
HTML et leur licence est déjà vérifiée.
- Avant de dessiner un objet, un appareil, un personnage, une icône ou un drapeau, cherche-le dans la bibliothèque,
  en français puis en anglais : `node scripts/library.mjs search "<mots>" [--kind <type>]`. Si rien ne convient,
  cherche dans le registre (`/hyperframes-registry`). Dessine-le seulement après ces deux recherches vides.
- Storyboard : sous chaque frame ou slide qui en montre, écris une ligne `Bibliothèque : <id>, <id>` avec les `id`
  retenus. S'il n'y en a aucun alors qu'un objet de ce genre est montré, écris `Bibliothèque : aucun (<mots
  cherchés>)`.
- Build : pour chaque `id` du storyboard, lance `node scripts/library.mjs add <id> {{dir}}` (`--color #RRGGBB` pour
  teindre une icône d'une seule couleur), puis utilise le chemin affiché dans un `<img>`. Ne copie jamais un fichier
  de `library/` à la main : `add` tient les crédits de la vidéo (`assets/library/CREDITS.json`). N'affiche pas une
  image bitmap plus grande que la taille indiquée par la recherche.
