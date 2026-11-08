# Collisions avec la scène

Les particules rebondissent sur un cadre, se posent sur un titre, s'accumulent au sol, meurent au contact. La **scène** dit ce qui fait obstacle ; la **recette** dit comment ses particules réagissent. Les collisions ne s'activent que si la scène (ou une scène voisine, ou le déroulé) déclare au moins un obstacle, ou si la recette décale le sol : sans obstacle, un effet se comporte comme avant.

## Déclarer les obstacles d'une scène

```html
<h1 id="titre" data-texte="titre" data-obstacle="forme"></h1>          <!-- forme exacte des lettres -->
<div class="plateau" data-obstacle></div>                              <!-- boîte de l'élément -->
<div data-obstacle-forme="ligne" data-de="10 80" data-a="60 95"></div> <!-- ligne invisible, en cqh -->
```

| Déclaration | Effet |
|---|---|
| `data-obstacle` | La boîte de l'élément, même tournée, mise à l'échelle ou animée (les particules posées suivent). |
| `data-obstacle="forme"` | La forme exacte (lettres d'un texte, silhouette d'une image), prise à la fin du minutage de l'élément. Un élément effacé à ce moment ne compte pas (alerte `obstacle-forme-vide`). |
| `data-obstacle="video"` ou `"forme video"` | Idem, et obstacle aussi pour les effets de la scène voisine pendant une transition. |
| `data-obstacle-forme="ligne"` | Ligne invisible : `data-de="x y"`, `data-a="x y"` (cqh). Aussi `cercle` (`data-centre`, `data-rayon`) et `rectangle` (`data-de`, `data-a`, `data-angle` en degrés). |
| Sol et murs | Le bas, la gauche et la droite de l'image sont toujours là ; la recette décale le sol avec `"sol": 90` (cqh depuis le haut). |

Au plus 16 obstacles par scène (les premiers dans l'ordre du document comptent). Un effet garde au plus 48 obstacles (bords, scène, scènes voisines, vidéo) et 8 couches d'empilement ; ceux de la vidéo passent en premier ; au-delà, une alerte dans la console de l'aperçu.

## Obstacles de la vidéo (déroulé)

```json
"obstacles": [ { "type": "sol", "a": 92 }, { "type": "ligne", "de": [0, 80], "a": [40, 95] } ]
```

Types `sol` (`a`), `ligne` (`de`, `a`), `cercle` (`centre`, `rayon`), `rectangle` (`de`, `a`, `angle`) ; au plus 8 obstacles de vidéo, valables dans toutes les scènes.

Couche commune : un effet qui **empile** sur un obstacle de la vidéo (`"empiler": true`, cible `elements`) hérite de la couche laissée par les effets commencés avant lui, quelle que soit leur scène. Chacun compte pour la couche qu'il avait formée au début de l'effet qui hérite (à sa fin s'il était déjà fini ; pendant une transition, sa couche à cet instant). La couche héritée est **dessinée** : une bande qui suit son profil, bord haut adouci, de la couleur à mi-vie des effets qui l'ont formée, dans le calque de l'effet qui hérite ; ses nouvelles particules se posent dessus. Elle n'est visible que **pendant que cet effet est affiché** : sans effet qui empile sur ce sol dans la scène suivante (ou avant son `data-start`), la neige d'une scène ne reste pas au sol. Pour une neige qui tient d'une scène à l'autre, mettre l'effet dans chaque scène, dès le début.

## Réglages d'une recette (`collisions`, par émetteur)

```json
"collisions": { "cibles": ["sol", "elements"], "reponse": "poser", "empiler": true, "talus": 35 },
"a_la_collision": { "emetteur": "eclabousse" }
```

| Champ | Rôle |
|---|---|
| `cibles` | Ce qui arrête les particules : `sol`, `murs`, `elements` (obstacles de la scène et de la vidéo), `formes` (formes exactes). Toutes par défaut. |
| `reponse` | `rebond` (défaut), `poser` (la particule reste sur l'obstacle et le suit), `mourir` (disparaît au contact). |
| `restitution` | Part de la vitesse gardée au rebond, de 0 à 1 (0,4). |
| `frottement` | Part de la vitesse le long de la surface perdue au contact, de 0 à 1 (0,2). |
| `repos_apres` | Secondes avant le fondu d'une particule posée ; absent : elle reste jusqu'à sa mort. |
| `empiler` | Avec `poser` : les particules posées forment une couche qui monte (neige, confettis). |
| `epaisseur` | Épaisseur d'une particule dans la couche, en cqh (par défaut sa taille). |
| `talus` | Pente la plus forte de la couche, en degrés (5 à 80, 35 par défaut). |
| `sol` | Sol décalé, en cqh depuis le haut ; active les collisions même sans obstacle déclaré. |
| `a_la_collision` | `{ "emetteur": "<nom>" }` : sous-émetteur lancé au point de contact, orienté selon la surface (`direction: [0, -1]` = perpendiculaire à la surface). Compte dans les 2 niveaux de sous-émetteurs ; un émetteur n'a qu'un parent. |

Bibliothèque : `confettis` et `neige` se posent et s'empilent, `pluie` meurt au contact et lance `eclabousse`, `etincelles` (et `braises`) rebondissent. Retouche : « la neige doit tenir sur le titre » → `data-obstacle="forme"` sur le titre.

Limites : une couche ne s'écroule pas quand son obstacle bouge, les grains ne roulent pas les uns sur les autres, les particules ne se heurtent pas entre elles (sauf avec un bloc `interactions` : voir « Interactions »). Un émetteur à collisions garde `z` pour la taille et l'ordre de dessin, mais sans décalage de perspective (ses particules restent sur leurs obstacles).

Contrôles : `obstacle-introuvable` (déclaration mal écrite), `collisions-invalides` (recette), `obstacles-video` (déroulé), alerte `trop-d-obstacles` (au-delà de 16 obstacles par scène ou de 8 obstacles de vidéo), alerte `obstacle-forme-vide` (forme exacte invisible à la fin de son minutage ; contrôle de la vidéo rendue, donc avec Chrome ou Edge ; aussi un panneau sur l'effet dans l'aperçu).

