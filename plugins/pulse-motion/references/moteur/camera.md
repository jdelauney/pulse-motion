# Caméra et parallaxe

```html
<div data-camera="zoom 1→1.06 0+4; x 50→44 3+0.3 cubic-out; y 50→70 3+0.3 cubic-out; secousse 1.2 6+0.2">
  <div class="ciel" data-profondeur="0.2"></div>
  <div class="collines" data-profondeur="0.6"></div>
  <div class="sol"></div>
</div>
<h2 class="titre-moyen" data-texte="carton" data-start="1"></h2>
```

- `data-camera` sur un conteneur **dans** la scène (jamais sur la `<section>`), qui couvre l'image ; ce qui est **hors** du conteneur (cartons, titres) reste fixe. Un titre placé après le conteneur prend `position: relative` pour passer devant lui.
- Clauses `propriété départ→arrivée début+durée [courbe]` (courbe par défaut `sine-inout`) :
  - `zoom` (1 = cadre normal, 2 = gros plan) ;
  - un grand zoom qui plonge à vitesse régulière : jeton `log` après la plage (`zoom 1→6 0+4 log`, #086), chaque doublement prend le même temps ;
  - `x`, `y` : le point visé, en % de l'image (50 = centre) — pour un travelling, déplacer `x` ; pour un gros plan sur un personnage en (44 %, 70 %), `zoom 1→3` avec `x 50→44; y 50→70` sur la même plage ;
  - `rotation` (deg), `saturation` (1 normal, 0 gris), `flou` (cqh) ;
  - `secousse <amplitude cqh> début+durée` : tremblement amorti (impact).
- Hors de toute clause, une propriété garde sa valeur de départ (avant) ou d'arrivée (après).
- `data-profondeur` sur un enfant de la caméra : 1 suit la caméra (défaut), 0 reste fixe, 0,3 = plan lointain. Utilise la propriété CSS `translate` : ne pas l'animer soi-même sur ces plans (`transform` reste libre).
- Le décor peut dépasser l'image (`left: 150%`) : la caméra va le chercher.
- Caméra automatique : `data-camera="auto"` (les plans viennent du relevé de la scène ; `zoom`, `x` et `y` ne s'y ajoutent pas) : `pulse-motion reference explication`. Une scène sans `auto` garde sa caméra écrite à la main.
- `--pm-ampleur-scene` sur la `<section>` multiplie l'amplitude des secousses (et des mouvements `pm-m-*`).
