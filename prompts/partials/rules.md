
---

Règles HyperFrames de ce studio. Elles résument `CLAUDE.md` et les skills, qui restent la référence pour le reste ;
`check` refuse une composition qui les enfreint.
- Composition : la racine de `{{dir}}/index.html` porte `data-composition-id`, `data-width` et `data-height`. Une
  sous-composition est un fichier `compositions/<nom>.html` contenant un `<template>` (le `<style>`, la racine puis
  le `<script>`, tous dans le template), chargé par `data-composition-src`. Sa racine est stylée par son id
  (`#root`), jamais par une classe ; les ids de ses éléments sont préfixés par celui de la composition.
- Temps : chaque élément minuté a `data-start`, une durée et `class="clip"`. Chaque composition enregistre une
  seule timeline GSAP en pause, sous l'id exact de sa `data-composition-id` :
  `window.__timelines["<id>"] = gsap.timeline({ paused: true });`. Une timeline ajoutée à la racine n'est pas en
  pause.
- GSAP : jamais deux `fromTo` sur la même cible (anime un parent pour un second mouvement), jamais plusieurs
  branches `if` qui écrivent chacune un tween sur la même cible. Sur la timeline racine, un appel par ligne avec
  une position numérique (`tl.to("#el-02", {…}, 3.2);`).
- Déterministe : ni `Date.now()`, ni `Math.random()`, ni réseau, ni police ou image externe (tout vient
  d'`assets/`).
- Mise en page : un élément qui en recouvre un autre exprès porte `data-layout-allow-overlap`, et un élément qui
  déborde exprès `data-layout-allow-overflow` (ces attributs ne s'héritent pas). Un élément d'opacité inférieure à
  0,2 compte comme invisible. Au-delà de 300 lignes (styles non comptés), découpe en sous-compositions.
- Lisibilité : contraste d'au moins 3:1 pour le gros texte et 4,5:1 sinon ; jamais un texte écrit dans sa propre
  couleur d'accent. Un texte animé dans un masque `overflow: hidden` a `padding-bottom: 0.08em` et un
  `line-height` d'au moins 1.08.
- Son : la voix et la musique sont des `<audio>` à part ; une vidéo source muette porte `muted`, une vidéo dont on
  garde le son `data-has-audio="true"`.
- Éditable : chaque élément visible que l'on voudra changer est un élément à part, nommé en français par
  `data-label="…"` (jamais `data-layer`, refusé par `check`) ; les textes restent du texte, les images des `<img>`.
- Vérifie avec `npm run check -- {{dir}}`, au premier plan, jusqu'à zéro erreur. Le studio le relance après toi.
