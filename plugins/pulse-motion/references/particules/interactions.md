# Interactions : essaims, fluides, grains

Les particules d'un émetteur peuvent **interagir entre elles** : une nuée d'oiseaux qui garde ses distances, de l'eau qui coule et remplit une cuve, du sable qui forme un vrai tas et s'écroule quand son support bouge. Un bloc `interactions` dans l'émetteur suffit ; le reste de la recette (naissance, forces, collisions, couleurs) ne change pas.

| Effet | Réglages | Quand l'utiliser |
|---|---|---|
| `nuee` | `nombre`, `vitesse`, `taille`, `couleur` | Collectif, mouvement d'ensemble, migration ; calque arrière, ancre sur une zone dégagée (la nuée tourne autour). |
| `banc` | `nombre`, `vitesse`, `couleur1`, `couleur2` | Mer, équipe, foule qui avance ensemble ; deux teintes dans un même banc. |
| `lucioles` | `nombre`, `couleur`, `eclat`, `vitesse` | Nuit, magie, idées qui flottent ; halo doux, petits groupes lâches. |
| `eau` | `nombre`, `couleur`, `refraction`, `gravite` | Eau versée depuis l'ancre qui remplit ce qui l'arrête : déclarer un sol ou une cuve (`data-obstacle`). |
| `miel` | `nombre`, `couleur`, `refraction`, `gravite` | Liquide épais et lent (miel, sirop, lave) ; dérivé de `eau`. |
| `sable` | `nombre`, `couleur`, `taille`, `frottement` | Sablier, temps qui passe, accumulation ; le tas s'écroule si son support bouge. |
| `neige-lourde` | `nombre`, `vitesse`, `taille`, `couleur` | Neige collante qui forme de vrais tas sur les obstacles ; plus coûteuse que `neige`. |

```html
<div id="cuve" data-obstacle data-start="0"></div>
<div data-effet="eau" data-ancre="#robinet" data-start="1" data-dur="2"></div>
```

## Réglages d'une recette (`interactions`, par émetteur)

```json
"interactions": { "type": "fluide", "rayon": 2, "viscosite": 0.05, "avec": ["autre-goutte"] }
```

| Champ | Rôle |
|---|---|
| `type` | `essaim`, `fluide` ou `grains`. |
| `rayon` | Rayon d'interaction en cqh (2) ; pour des grains, au moins leur taille maximale. |
| `avec` | Autres émetteurs du même effet qui interagissent avec celui-ci (même type ; 8 émetteurs liés au plus). |
| `separation`, `alignement`, `cohesion` | Essaim : poids de 0 à 5 (1,5 ; 1 ; 1). |
| `vision` | Essaim : `{ "rayon": 6, "angle": 270 }` (cqh, degrés) : ce que chaque individu voit devant lui. |
| `vitesse` | Essaim : vitesse bornée `[min, max]` en cqh/s (`[5, 20]`). |
| `cible` | Essaim : point visé, fraction de la zone (`[0.5, 0.5]`) ou `"ancre"`. |
| `fuite` | Essaim : évitement des obstacles vus devant (30) ; un attracteur à force négative de la recette repousse aussi. |
| `densite` | Fluide : particules par cellule au repos (6). |
| `viscosite` | Fluide : de 0 (eau) à 1 (miel épais) (0,05). |
| `tension` | Fluide : cohésion de surface de 0 à 1 (0,1) : gouttes qui tiennent et fusionnent. |
| `incompressibilite` | Fluide : itérations, de 2 à 6 (4) ; plus : moins compressible, plus coûteux. |
| `frottement` | Grains : `{ "statique": 0.6, "dynamique": 0.4 }` ; le tas prend l'angle dont la tangente vaut `statique` (0,6 : 31°). |
| `cohesion` (grains) | De 0 à 1 (0) : grains collants (neige mouillée). |
| `restitution` | Grains : rebond entre grains, de 0 à 1 (0,1). |

Rendu `fluide` (dans `rendu`) : une nappe lisse au lieu de points.

| Champ | Rôle |
|---|---|
| `"type": "fluide"` | Nappe en espace écran : particules fondues en une surface, avec reflet. |
| `teinte` | Couleur du fluide (`#4aa8ff`). |
| `opacite` | De 0 à 1 (0,85). |
| `absorption` | Assombrissement selon l'épaisseur, par cqh (0,25) : une flaque fine est claire, une cuve profonde dense. |
| `refraction` | De 0 à 1 (0) : la scène vue déformée à travers le fluide (photographie de la scène : approchée dans l'aperçu, exacte à l'export). |
| `lissage` | Rayon du lissage de la nappe, en cqh (1). |

- Obstacles : les `collisions` (réponse `rebond` ou `mourir`) s'appliquent aux trois types ; les grains forment eux-mêmes leur tas : ni `poser` ni `empiler` avec `interactions`.
- Coût : jusqu'à 100 000 particules par émetteur en essaim, 60 000 en fluide ou en grains ; un fluide ou des grains coûtent bien plus que des particules simples : partir des réglages de la bibliothèque.
- Déterminisme : dans une même sortie (aperçu, export rapide ou export fidèle), l'image ne dépend que de l'instant, quel que soit l'ordre des retours en arrière, et deux exports du même mode sont identiques. D'une sortie à l'autre, un essaim, un fluide ou des grains gardent la même allure, mais pas forcément la même image au pixel près : la mise en page diffère d'un millième de cqh selon la taille de la page, les mesures arrondies au 1/64 de cqh l'absorbent presque toujours, et un écart restant est amplifié par les interactions.

Contrôles : `interactions-invalides` (type inconnu, `avec` vers un émetteur absent, sans `interactions` ou d'un autre type, émetteur de fragmentation, réponse `poser`, grain plus grand que `rayon`, `rayon` de grains au-delà de 8,9 × leur taille minimale), alerte `budget-interactions` (au-delà des limites par émetteur, ou plus de 48 particules en moyenne par cellule de voisinage, étalées sur toute la scène). Une cellule de voisinage (carré de côté `rayon`, ou `vision.rayon` pour un essaim) compte au plus 96 particules ; au-delà, pour ce pas, ses particules s'ignorent entre elles (elles se traversent) : un essaim nombreux à grande `vision` qui se resserre sur sa cible y arrive vite. Dans l'aperçu, la console signale une réfraction ignorée tant que la photographie de la scène n'est pas prête.

Limites : pas de mélange de fluides (eau et huile), pas de grains de forme complexe, une corde ou un tissu se lie à des particules par `avec` (voir « Cordes et tissus »).

