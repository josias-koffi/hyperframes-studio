# Natural Earth

Cartes générées par `scripts/library/natural-earth.mjs` depuis Natural Earth (domaine public,
https://www.naturalearthdata.com/), fichier ne_10m_admin_0_countries_fra.geojson du dépôt nvkelso/natural-earth-vector au commit
ca96624a56bd078437bca8184e78163e5039ad19, avec d3-geo 3.1.1 et topojson 3.

Frontières : vue officielle française de Natural Earth. La Crimée est ukrainienne ; Somaliland, Chypre du Nord et le
Sahara occidental sont fondus dans la Somalie, Chypre et le Maroc ; la partie du Golan tenue par Israël n'appartient à
aucun État. Tracés du 1:10m simplifiés pour chaque carte selon
la surface qu'elle montre (un point part quand il pèse moins de 0.5 px²). Monde sans l'Antarctique ; une carte de pays ne garde que les parties à moins de
2500 km de la plus grande.
