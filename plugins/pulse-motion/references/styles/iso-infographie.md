# Style « iso-infographie »

> Un système qui s'anime en diorama isométrique : des blocs plats à trois tons, une couleur par type d'objet, des étiquettes fines et des nombres en Isotype ; les choses s'ouvrent pour montrer leur intérieur.
> Sources : lemo-opuscar, `iso-infographic` (MIT, © 2026 LemoLab) ; adapté.

## L'essentiel

- Partir d'une des **9 scènes toutes faites** (`pulse-motion scene iso-infographie <type>`) ; le `type` noté au déroulé permet de changer de style sans réécrire la scène.
- Décor (`.losange`, `data-decor`) : `data-dur="scene"`. Sur la **dernière scène**, il s'arrête 1 s avant la fin : image stable d'au moins 0,5 s.
- Formats 16:9, 1:1, 4:5 et 9:16. Ton clair seulement.
- Chaque objet qui bouge a son propre `data-start`. Longueurs maximales : § 10.

## 1. Essence, et ce qu'il n'est pas

- Un site, une machine ou un circuit vu de trois quarts, en vraie isométrie : il se construit bloc par bloc, dans l'ordre où il fonctionne, et s'ouvre pour montrer ce qu'il cache.
- Pas de la 3D : ni lumière, ni reflet, ni perspective, des aplats à trois tons. Pas un schéma plat ni `plan-technique` : des volumes, pas des traits. Pas `iso-album` : un système à comprendre, pas une règle jouée par des personnages.

## 2. Matières et rendu

- Plan : `<div class="iso" data-iso>` et ses `<i>` : `data-iso-boite="x y z l p h"`, `-prisme` (toit, `data-iso-crete="x|y"`), `-cylindre="x y z r h"`, `-extruder="x,y x,y …"` (`data-iso-z`, `data-iso-h`), `-personne="x y z"`, `-isotype="x y z n"` (`data-iso-pas`). x vers la droite, y vers la gauche, z en haut.
- `data-couleur` : `iso1` … `iso6` (types d'objet), `accent` (le sujet), `primaire`. Entrées : `.iso-pose`, `.iso-monte` ; `data-iso-depuis` ou `data-iso-vers="x y z"` déplace sur `data-dur` ; `data-iso-coupe="2.6"` ouvre la boîte ; `.focus` minuté sur le plan : tout au gris sauf `.sujet`.
- Étiquette posée sur le plan : `<p class="fine" data-texte="…" data-iso-ancre="x y z" data-iso-fil="1.2">`.

## 3. Logique de couleur

- Une couleur par type d'objet, tenue toute la vidéo (bâtiments `iso1`, véhicules `iso2`, toits `iso3`, sol `iso4`) ; `--c-accent` pour le seul sujet de la scène ; `--c-primaire` pour les étiquettes et les silhouettes.
- Fond pâle sous une trame isométrique à 9 %. Palette d'exemple : encre `#231a2c`, bleu `#2f5d9e`, rouge `#c03e24`.

## 4. Typographie et sous-titres

- **Archivo** 800 : titres (8,4 cqh, moyen 5,8), chiffres (19 cqh, `tabular-nums`) ; **Barlow** 500 : texte (3,9 cqh), 700 : étiquettes fines (3,6 cqh).
- Sous-titres du moteur.

## 5. Qualité du mouvement

- `cubic-out`, `back-out`, 0,5 à 0,8 s ; un bloc à la fois, dans l'ordre du système ; les silhouettes marchent par à-coups, 12 i/s (#013).
- Conseillés : #011, #021, #037, #128. Déconseillés : #028, #036, #020.

## 6. Grammaire de caméra et transitions

| Mouvement | Ce qu'il exprime | Peut servir |
|---|---|---|
| Plan fixe | lire le système | presque toutes les scènes |
| Zoom sur un détail (#037) | un bloc de près | le sujet, une coupe |
| Recul (#128) | l'infographie finie | la conclusion |

- Le plan reste droit : jamais de rotation, l'isométrie se perdrait.
- Transitions : `glissement`, `fondu`, `zoom`. À éviter : `whip`, `retournement`.
- Shaders conseillés, jamais imposés : aucun.

## 7. Palette sonore

- Ambiance `corporate` par défaut, `inspirant` en alternative.
- Bruitages : forme → `pop` (un bloc qui se pose), point → `pop`, tracé → `tic`, chiffre → `tic`.
- Moment fort : `ding`. Le silence pendant que la coupe s'ouvre.

## 8. Gestes natifs

- **La coupe.** *Recette :* `data-iso-coupe`, l'intérieur en `.iso-monte`. *Convient à :* une machine ; un entrepôt ; une étape cachée.
- **Le nombre en Isotype.** *Recette :* `data-iso-isotype`, une silhouette par unité. *Convient à :* un effectif ; une fréquentation ; une part.
- **Focus et contexte.** *Recette :* `.focus` minuté, `.sujet` sur l'objet. *Convient à :* une alerte ; le point clé ; une comparaison.
- **La pile qui monte.** *Recette :* boîtes en `.iso-pose`, une par point. *Convient à :* une liste ; un cumul ; un bilan.

## 9. Pièges

- Objets qui s'interpénètrent : ordre de dessin faux ; espacer, ou `data-iso-biais`.
- Détails trop fins : ils disparaissent en 9:16 ; 8 objets par plan au plus.

## 10. Scènes toutes faites et classes

| Scène | Rôle | Durée | Textes (longueur maximale) |
|---|---|---|---|
| `titre` | Le site se construit | 7 s | etiquette 22, titre 32, sous 46 |
| `liste` | Chaque point pose son bloc | 12 s | titre 32, point1 … point4 36 |
| `chiffre` | La valeur et l'Isotype | 7 s | titre 32, unite 3, legende 46 ; `nombre 0→…` |
| `comparaison` | La première au gris | 12 s | titre 32, gauche-titre et droite-titre 16, gauche-texte et droite-texte 48 |
| `etape` | La machine s'ouvre | 8 s | numero 2, titre 32, texte 64 |
| `alerte` | Tout au gris sauf le sujet | 8 s | titre 32, texte 64 |
| `schema` | Trois maquettes reliées | 8 s | titre 32, a, b, c 14 |
| `moyeu` | Centre et parties | 10 s | titre 32, centre 18, parties 16 |
| `conclusion` | Le recul, le logo | 6 s | titre 32, sous 44 |

Point ou logo absent : retirer son élément et sa clé (un point : aussi son bloc).
- Texte : `.titre`, `.titre-moyen`, `.texte`, `.etiquette`, `.fine`, `.nombre`, `.compte`, `.arrive`.
- Scènes : `.une`, `.inverse`, `.faits`, `.mesure`, `.duo`, `.cote`, `.numero`, `.signal`, `.chaine`, `.maillon`.

Scène composée : ces classes et `<style>@scope { … }</style>`.

## 11. Espace de variation

- Claude décide pour chaque vidéo : les objets du système et leur couleur par type, le sujet, ce que la coupe révèle.
- Structures : le système se construit → il fonctionne → on ouvre le point clé ; le site avant → après ; le parcours d'un produit, poste par poste.
- Ouvertures : le site qui se construit ; une seule boîte qui s'ouvre ; un nombre en Isotype.
- Fins : le recul sur le site fini ; le sujet seul en couleur ; la pile complète.
- Usages : expliquer un système ou un circuit ; montrer un site, un entrepôt, une usine ; faire voir l'intérieur d'une machine.
