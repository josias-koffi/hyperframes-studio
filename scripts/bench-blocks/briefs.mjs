// Ten reference briefs for the blocks engine: videos (voice, silent with music, template), carousels, images.
const P = { "9:16": [1080, 1920], "1:1": [1080, 1080], "4:5": [1080, 1350], "16:9": [1920, 1080] };

export default [
  {
    id: "b01-cafe-tiktok",
    type: "video",
    aspect: "9:16",
    duration: 15,
    campaign: "Thermo — tasse isotherme en céramique.\n\nTon direct, complice, pour les 25-35 ans qui travaillent en télétravail.",
    assets: ["assets/uploads/tasse.jpg", "assets/uploads/logo-thermo.png"],
    brief: `# Brief — Pub TikTok Thermo

Objectif : faire découvrir la tasse Thermo, qui garde le café chaud 3 heures sans batterie.
Public : télétravailleurs 25-35 ans qui oublient leur café.
Message clé : « Ton café reste chaud pendant 3 heures. »
Preuves : double paroi céramique, 3 h à 60 °C, lavable au lave-vaisselle.
Appel à l'action : commander sur thermo.fr, -15 % avec le code CHAUD.
Voix off : oui, ton complice. Musique : légère, lo-fi.
Format : 9:16, 15 secondes.`,
  },
  {
    id: "b02-meditation",
    type: "video",
    aspect: "9:16",
    duration: 30,
    campaign: "Respire — application de méditation guidée.\n\nTon doux, rassurant, jamais culpabilisant.",
    assets: [],
    brief: `# Brief — Lancement de l'application Respire

Objectif : téléchargements de l'application pendant la semaine de lancement.
Public : actifs stressés de 30-45 ans qui n'ont « pas le temps » de méditer.
Message clé : 5 minutes par jour suffisent pour mieux dormir.
Preuves : 72 % des utilisateurs disent mieux dormir après 2 semaines (étude interne 2025, 1 200 utilisateurs) ; séances de 5 minutes ; sans abonnement le premier mois.
Étapes à montrer : ouvrir l'app, choisir une séance, respirer.
Appel à l'action : télécharger Respire, gratuit le premier mois.
Voix off : oui, voix calme. Musique : ambiante et douce.
Format : 9:16, 30 secondes.`,
  },
  {
    id: "b03-coiffure-muette",
    type: "video",
    aspect: "1:1",
    duration: 20,
    campaign: "Atelier Lune — salon de coiffure à Lyon.\n\nTon chaleureux, local.",
    assets: ["assets/uploads/salon.jpg"],
    brief: `# Brief — Réouverture du salon Atelier Lune

Objectif : annoncer la réouverture après travaux, le 4 novembre.
Public : clientèle du quartier de la Croix-Rousse.
Message clé : un salon tout neuf, la même équipe.
Infos : nouveau bac de lavage massant, prise de rendez-vous en ligne, ouvert du mardi au samedi.
Appel à l'action : réserver sur atelierlune.fr.
Vidéo muette pour Instagram : pas de voix off, juste une musique pop légère.
Format : 1:1, 20 secondes.`,
  },
  {
    id: "b04-facturation-b2b",
    type: "video",
    aspect: "16:9",
    duration: 45,
    campaign: "Factoo — logiciel de facturation pour indépendants.\n\nTon clair, professionnel, rassurant.",
    assets: ["assets/uploads/ecran-factoo.png", "assets/uploads/logo-factoo.png"],
    brief: `# Brief — Explainer Factoo pour LinkedIn

Objectif : demandes d'essai gratuit.
Public : indépendants et TPE qui font leurs factures sur un tableur.
Problème : 4 heures par mois perdues sur les factures et les relances.
Solution : Factoo crée la facture en 30 secondes et relance automatiquement les impayés.
Preuves : 12 000 indépendants l'utilisent ; paiements reçus 9 jours plus tôt en moyenne ; conforme à la facturation électronique 2026.
Avant / après : avant, un tableur et des relances à la main ; après, des factures envoyées et relancées toutes seules.
Appel à l'action : essai gratuit 30 jours sur factoo.fr.
Voix off : oui, posée. Musique : corporate légère.
Format : 16:9, 45 secondes.`,
  },
  {
    id: "b05-temoignage",
    type: "video",
    aspect: "9:16",
    duration: 20,
    campaign: "Verdure — paniers de légumes bio livrés à domicile.\n\nTon simple et authentique.",
    assets: ["assets/uploads/claire.jpg", "assets/uploads/panier.jpg"],
    brief: `# Brief — Témoignage client Verdure

Objectif : rassurer les hésitants avec un vrai témoignage.
Témoignage (exact, à citer tel quel) : « Je ne fais plus les courses le samedi, et mes enfants mangent enfin des légumes. » — Claire Dubois, cliente depuis 2023.
Note donnée par Claire : 5 étoiles.
Infos : paniers bio de producteurs à moins de 100 km, livrés le jeudi, sans engagement.
Photos fournies : Claire (claire.jpg) et un panier (panier.jpg).
Appel à l'action : premier panier à 9,90 € sur verdure.fr.
Voix off : oui. Musique : acoustique douce.
Format : 9:16, 20 secondes.`,
  },
  {
    id: "b06-template-soldes",
    type: "video",
    kind: "template",
    aspect: "9:16",
    duration: 15,
    campaign: "Maison Lin — linge de maison en lin lavé.\n\nTon élégant, épuré.",
    assets: ["assets/uploads/drap.jpg", "assets/uploads/logo-lin.png"],
    variables: [
      { id: "headline", type: "string", label: "Accroche de l'offre", default: "-30 % sur le lin lavé", maxLength: 32 },
      { id: "product_photo", type: "string", label: "Photo du produit", default: "assets/uploads/drap.jpg" },
      { id: "end_date", type: "string", label: "Date de fin de l'offre", default: "Jusqu'au 30 novembre", maxLength: 28 },
      { id: "cta", type: "string", label: "Texte du bouton", default: "J'en profite", maxLength: 18 },
    ],
    brief: `# Brief — Template de promotion Maison Lin

Objectif : un modèle de vidéo promo réutilisable à chaque opération (soldes, Black Friday, fête des mères).
Ce qui change d'une déclinaison à l'autre : l'accroche de l'offre, la photo du produit, la date de fin, le texte du bouton.
Ce qui reste : l'identité Maison Lin (fond crème #F4EFE6, accent terracotta #B5523B), le logo à la fin.
Voix off : non. Musique : non.
Format : 9:16, 15 secondes.`,
  },
  {
    id: "b07-carrousel-nutrition",
    type: "carousel",
    aspect: "4:5",
    frames: 5,
    campaign: "NutriFacile — coach en nutrition en ligne.\n\nTon pédagogique et bienveillant.",
    assets: [],
    brief: `# Brief — Carrousel Instagram « 3 erreurs au petit-déjeuner »

Objectif : enregistrements et partages du post.
Contenu : 3 erreurs fréquentes au petit-déjeuner :
1. Sauter le petit-déjeuner puis grignoter à 11 h.
2. Boire un jus de fruits au lieu de manger un fruit.
3. Oublier les protéines (œuf, yaourt, fromage blanc).
Chiffre : 1 Français sur 4 saute le petit-déjeuner (Crédoc 2023).
Dernière slide : suivre @nutrifacile pour un conseil par jour.
Format : carrousel 4:5, 5 slides.`,
  },
  {
    id: "b08-carrousel-lancement",
    type: "carousel",
    aspect: "1:1",
    frames: 6,
    campaign: "Boréal — gourde filtrante pour la randonnée.\n\nTon aventureux, concret.",
    assets: ["assets/uploads/gourde.jpg", "assets/uploads/logo-boreal.png"],
    brief: `# Brief — Carrousel de lancement de la gourde Boréal

Objectif : précommandes.
Message clé : boire l'eau de n'importe quel ruisseau sans risque.
Preuves : filtre 99,9 % des bactéries ; 1 500 litres par filtre ; 280 g seulement.
Avant / après : avant, 3 litres d'eau dans le sac ; après, une gourde de 280 g et les ruisseaux du chemin.
Avis d'un testeur : « Trois semaines sur le GR20 sans porter d'eau. » — Hugo, guide de montagne.
Appel à l'action : précommande sur boreal-outdoor.fr, livraison en mars.
Format : carrousel 1:1, 6 slides.`,
  },
  {
    id: "b09-image-evenement",
    type: "image",
    aspect: "4:5",
    frames: 1,
    campaign: "La Fabrique — tiers-lieu culturel à Nantes.\n\nTon festif.",
    assets: [],
    brief: `# Brief — Visuel de la soirée d'anniversaire

Objectif : annoncer les 10 ans de La Fabrique, samedi 15 novembre à 19 h, entrée libre.
Au programme : concerts, food trucks, atelier sérigraphie.
Le visuel doit donner la date et l'heure en un coup d'œil.
Format : image 4:5 pour Instagram.`,
  },
  {
    id: "b10-image-offre",
    type: "image",
    aspect: "1:1",
    frames: 1,
    campaign: "Vélo Ville — atelier de réparation de vélos.\n\nTon pratique, direct.",
    assets: ["assets/uploads/atelier.jpg"],
    brief: `# Brief — Visuel de l'offre révision d'automne

Objectif : réservations de révisions en octobre.
Offre : révision complète à 49 € au lieu de 69 €, jusqu'au 31 octobre.
Photo fournie : l'atelier (atelier.jpg).
Appel à l'action : réserver sur veloville.fr.
Format : image 1:1.`,
  },
].map((brief) => ({ kind: "oneshot", ...brief, width: P[brief.aspect][0], height: P[brief.aspect][1] }));
