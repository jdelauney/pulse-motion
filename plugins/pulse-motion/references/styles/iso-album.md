# Style « iso-album »

> L'explication calme d'une règle du quotidien, dans un lieu dessiné en vraie isométrie à aplats : de petits personnages vus de dos font la chose dans l'ordre, et le texte à empattements se pose au sol, lettre à lettre.
> Sources : lemo-opuscar, `isometric-picture-book` (MIT, © 2026 LemoLab) ; adapté.

## L'essentiel

- Partir d'une des **9 scènes toutes faites** (`pulse-motion scene iso-album <type>`) ; le `type` noté au déroulé permet de changer de style sans réécrire la scène.
- Décor (`.nuage`, `data-decor`) : `data-dur="scene"`. Sur la **dernière scène**, il s'arrête 1 s avant la fin : image stable d'au moins 0,5 s.
- Formats 16:9, 1:1, 4:5 et 9:16. Ton clair seulement.
- Le plan s'écrit comme dans `iso-infographie` (§ 2 de sa fiche). Longueurs maximales du § 10.

## 1. Essence, et ce qu'il n'est pas

- Un lieu du quotidien (accueil, couloir, cuisine, atelier) en isométrie à aplats doux ; de petits personnages sans visage, vus de dos, font la chose dans l'ordre ; le texte se pose au sol, près de ce qu'il dit ; un ton de livre illustré.
- Pas un dessin animé à gags : aucun visage, aucune expression. Pas `iso-infographie` : un lieu habité et une règle, pas un système à démonter. Pas `chaleureux` : un lieu dessiné, pas des cartes arrondies.

## 2. Matières et rendu

- Plan : `<div class="iso" data-iso>` et ses `<i data-iso-…>` (boîte, prisme, cylindre, contour extrudé, personne, Isotype) ; sol `iso2`, murs `iso4`, meubles `iso5`, plantes `iso1`, eau et vitres `iso3`.
- Personne : `data-iso-personne="x y z"`, `data-iso-depuis="x y z"` (elle marche à sa place sur `data-dur`), `.iso-entre` : absente avant son départ.
- Texte au sol : `<p class="au-sol" data-texte="…" data-iso-ancre="x y z" data-lettres="ecrit" data-dur="1.4">`, `.grand` pour un numéro ; court.

## 3. Logique de couleur

- Aplats doux tirés du papier ; `--c-accent` pour le bon geste, le danger ou le guichet, un par scène ; `--c-primaire` pour les personnages et les repères.
- Palette d'exemple : papier `#f6efe2`, encre `#2b2a33`, vert `#3a7264`, terre cuite `#b5481f`.

## 4. Typographie et sous-titres

- **Fraunces** 600 : titres (8,6 cqh, moyen 6), chiffres (19 cqh), texte au sol (5 cqh, 11 pour un numéro) ; **Nunito Sans** 400 : texte (3,9 cqh), 700 : repères (3,6 cqh).
- Sous-titres du moteur.

## 5. Qualité du mouvement

- Lent et posé : `sine-inout`, `cubic-out`, 0,7 à 0,9 s ; une personne à la fois, dans l'ordre ; la marche par à-coups (#013) ; rien ne rebondit.
- Conseillés : #013, #021, #065, #128. Déconseillés : #001, #028, #036.

## 6. Grammaire de caméra et transitions

| Mouvement | Ce qu'il exprime | Peut servir |
|---|---|---|
| Plan fixe | regarder la règle se jouer | presque toutes les scènes |
| Zoom sur la personne (#037) | le geste de près | une étape |
| Ralenti (#065) | le bon geste, montré deux fois | une étape |
| Recul (#128) | le lieu entier, chacun à sa place | la conclusion |

- Le lieu reste droit, vu de trois quarts ; on ne le tourne jamais.
- Transitions : `fondu`, `glissement`. À éviter : `whip`, `zoom`, `retournement`.
- Shaders conseillés, jamais imposés : `grain`.

## 7. Palette sonore

- Ambiance `calme` par défaut, `acoustique` en alternative.
- Bruitages : forme → `pop`, point → `tic`, chiffre → `tic` ; tracé et écriture → `papier`.
- Matière : `papier`. Moment fort : `carillon`.

## 8. Gestes natifs

- **La règle jouée dans l'ordre.** *Recette :* une personne par étape, `.iso-entre`, départs échelonnés. *Convient à :* une file d'attente ; un ordre de passage ; une procédure.
- **Deux façons côte à côte.** *Recette :* scène `comparaison`, plus lente à gauche. *Convient à :* le bon et le mauvais geste ; avant et après ; deux organisations.
- **Le texte posé au sol.** *Recette :* `.au-sol`, `data-lettres="ecrit"`. *Convient à :* un titre ; un numéro d'étape ; une consigne courte.
- **Le temps qui se compte.** *Recette :* compteur (#021) et Isotype. *Convient à :* une attente ; une fréquentation ; une durée.

## 9. Pièges

- Texte au sol trop long : illisible en 9:16 ; 18 caractères au plus, une ligne.
- Trop de personnes à la fois : deux ou trois en mouvement au plus.
- Un visage ou une expression : le style devient un dessin animé.

## 10. Scènes toutes faites et classes

| Scène | Rôle | Durée | Textes (longueur maximale) |
|---|---|---|---|
| `titre` | Le lieu, l'étiquette au sol | 7 s | etiquette 18, titre 32, sous 46 |
| `liste` | La règle dans l'ordre, la file | 12 s | titre 32, point1 … point4 36 |
| `chiffre` | La valeur, les personnes arrivent | 7 s | titre 32, unite 3, legende 46 ; `nombre 0→…` |
| `comparaison` | La bonne façon, plus rapide | 12 s | titre 32, gauche-titre et droite-titre 16, gauche-texte et droite-texte 48 |
| `etape` | Le numéro au sol | 8 s | numero 2, titre 32, texte 64 |
| `alerte` | Le danger, on s'arrête | 8 s | titre 32, texte 64 |
| `schema` | Trois lieux reliés | 8 s | titre 32, a, b, c 14 |
| `moyeu` | Centre et parties | 10 s | titre 32, centre 18, parties 16 |
| `conclusion` | Le lieu entier, le logo | 6 s | titre 32, sous 44 |

Point ou logo absent : retirer son élément et sa clé (un point : aussi sa personne).
- Texte : `.titre`, `.titre-moyen`, `.texte`, `.au-sol`, `.repere`, `.nombre`, `.compte`, `.arrive`.
- Scènes : `.une`, `.inverse`, `.faits`, `.mesure`, `.duo`, `.cote`, `.etape-texte`, `.signal`, `.chaine`, `.maillon`.

Scène composée : ces classes et `<style>@scope { … }</style>`.

## 11. Espace de variation

- Claude décide pour chaque vidéo : le lieu, les personnes et leur ordre, le bon geste à l'accent, le texte au sol.
- Structures : le lieu → la règle jouée → ce qu'on retient ; le mauvais geste → le bon ; une procédure, étape par étape.
- Ouvertures : le lieu vide qui attend ; le titre écrit au sol ; une première personne qui entre.
- Fins : le lieu entier, chacun à sa place ; la règle écrite au sol ; la file en ordre.
- Usages : expliquer une consigne de sécurité ; présenter une procédure d'accueil ; montrer le bon ordre de passage.
