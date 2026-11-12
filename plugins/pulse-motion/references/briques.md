# Briques : typographie cinétique, karaoké, QR codes, Ken Burns, 2,5D

Briques nommées de la spec « Lacunes créatives » (S9, 5.4 à 5.12). Chacune a son entrée au dictionnaire (`pulse-motion mouvements afficher <n°>`, #129 à #140), avec une recette prête à poser. La feuille `moteur/briques.css` et les modules `trace` et `ken-burns` du moteur ne sont embarqués que si une scène s'en sert : une vidéo qui n'en utilise aucune garde sa page. Toutes sont en SVG, CSS ou DOM (ni `filter: url()`, ni fusion) et passent par l'export rapide, sauf l'espace en perspective de la 2,5D.

## Texte sur un tracé (#129)

```html
<svg class="pm-sur-trace" viewBox="0 0 1000 400"><path id="arc-1" d="M50 350 Q500 0 950 350" fill="none"/>
  <text><textPath href="#arc-1" data-texte="slogan" data-start="0.5" data-sur-trace="defile 100→0 0+3 sine-inout"></textPath></text></svg>
```

- `defile <de>→<à> <début>+<durée> [courbe]` : `startOffset` en % du tracé ; `ecrit <début>+<durée>` : les lettres apparaissent tour à tour. Temps depuis l'apparition de l'élément (`data-start`), `t` permis avec un tempo.
- Couleur : `color` (le `fill` suit `currentColor`), mesurée comme un texte. Un `<tspan>` ne prend pas de `transform` : sur un `<textPath>`, `data-lettres` n'accepte que `frappe` et `fondu` (sinon `lettres-invalide`). `ecrit` ne se combine pas avec `data-lettres`.
- Règle : `sur-trace-invalide`.

## Police variable (#130, #131)

- `class="pm-variable"` puis `data-tween="--pm-wght 300→800"` (aussi `--pm-wdth`, `--pm-slnt`) ; `data-lettres="graisse"` : chaque lettre passe de la graisse la plus fine de sa police à celle du texte (pas de 0,04 s).
- Polices variables livrées : Inter (graisse de 100 à 900) et Figtree (300 à 900) du style `clair-pedagogique`. `pulse-motion police <fichier>` annonce les axes d'une police fournie (« police variable : graisse de 100 à 900 »).
- Règle : `police-non-variable` (alerte) quand l'axe animé manque à la police du rôle de l'élément.

## Texte rempli d'une image, masques (#132 à #134)

- `class="pm-texte-image" style="--pm-texte-image: url(assets/photo.jpg)"` (embarquée), position animable : `data-tween="--pm-texte-image-x 0%→100%"` ; lettre par lettre compris.
- `pm-m-masque-doux` : révélé par un bord flou qui avance avec `--p` (l'élément minuté) ; `--pm-sens` (90deg) ; variantes `pm-m-masque-doux-vertical`, `pm-m-masque-doux-radial`.
- `pm-masque-forme` : `--pm-forme: url(assets/forme.svg)` (ou un dégradé), `--pm-forme-taille` animable.
- Contraste : un texte rempli (dégradé, image, karaoké) est jugé sur la couleur réelle de ses lettres (`contraste-reel`).

## Karaoké

- `"sousTitres": { "mode": "karaoke" }` : chaque mot se remplit de l'accent (`--pm-st-accent`, `--c-accent-lisible` par défaut) de gauche à droite pendant qu'il est dit. Pas de syllabes : le remplissage linéaire sur la durée du mot en donne l'effet.
- Il suit les mots calés de la voix (transcription ou voix de synthèse) ; sans eux : alerte `karaoke-sans-voix`.

## QR code (#135)

```html
<svg data-qr="lien" data-qr-correction="M" data-start="0.3" style="width: 40cqh; height: 40cqh"></svg>
```

- `lien` est une clé de `scenes[].textes` (la personne change l'adresse par une retouche) ; texte absent : `texte-manquant`. Le code est fabriqué à l'assemblage, sur l'ordinateur (aucun service) : un seul tracé, bords nets, marge de 4 modules.
- `data-qr-correction` : L, M (défaut), Q ou H. `data-qr-encre` et `data-qr-fond` : une couleur de la charte par son nom, ou `#rrggbb` ; `#000` sur `#fff` par défaut ; toujours foncé sur clair.
- Apparition : fondu ou pop-in comme tout élément, ou `class="pm-qr-compose"` (les rangées arrivent l'une après l'autre) ; ensuite, immobile.
- Règles : `qr-trop-petit`, `qr-trop-court`, `qr-contraste`, `qr-long`, `qr-hors-zone`, `qr-invalide` (`pulse-motion reference controles`).

## Ken Burns (#136)

```html
<div class="photo" data-ken-burns="auto" data-start="0.3"><img src="assets/cuisine.jpg" alt="La cuisine"></div>
```

- `data-ken-burns="<sens> [ampleur]"` sur le cadre de l'image : `auto`, `avant`, `arriere`, `gauche`, `droite`, `haut`, `bas` ; ampleur = zoom final, 1,12 par défaut, de 1,03 à 1,3.
- De l'apparition du cadre à la fin de la scène, en `sine-inout` ; `auto` tire le sens (jamais deux fois de suite le même dans la vidéo, le même à chaque rendu). Le cadre reçoit `overflow: hidden`, l'image le couvre.
- Le zoom final compte pour `image-agrandie` : fournir une photo assez grande. Toute la scène : #056. Règle : `ken-burns-invalide`.

## 2,5D (#137 à #140)

- `pm-espace-3d` (perspective `--pm-perspective`, 150cqh) autour, `pm-3d-face` sur chaque face (cachée de dos).
- Carte qui se retourne : `pm-m-retourne` (recto, verso `pm-3d-face pm-3d-verso`), 0,8 s. Cube : `pm-m-cube`, 4 faces, un quart de tour par temps (`--pm-cube-pas`, le temps de la musique avec un tempo, sinon 1 s).
- Écran incliné : la classe `pm-3d` du #106 avec `--pm-3d-pose: rotateX(22deg) rotateZ(-8deg)`. Texte en relief : `pm-relief` (`--pm-relief`, 0,08 em), six ombres, sans vraie 3D.
- L'export rapide aplatit un espace en perspective (`pm-espace-3d`, carte, cube) : règle `trois-d-export-rapide`, et il refuse la scène ; l'export fidèle (ffmpeg) la rend. L'écran incliné et le relief passent partout.
- La vraie 3D (maillages, glTF) n'existe pas dans Pulse Motion.
