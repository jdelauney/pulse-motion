# Style « papier-decoupe »

> Des couches de papier découpé, aux bords un peu irréguliers, séparées par de vraies ombres portées : la profondeur vient des ombres, et une feuille qui se soulève dit ce qui compte.
> Sources : take-one, `paper-cutout` (MIT) ; lemo-opuscar, techniques de `papercut-red` (MIT, © 2026 LemoLab) ; adaptés.

## L'essentiel

- Partir d'une des **9 scènes toutes faites** (`pulse-motion scene papier-decoupe <type>`) ; le `type` noté au déroulé permet de changer de style sans réécrire la scène.
- Décor (`.colline`, `.rond`, `data-decor`) : `data-dur="scene"`. Sur la **dernière scène**, il s'arrête 1 s avant la fin : image stable d'au moins 0,5 s.
- Formats 16:9, 1:1, 4:5 et 9:16. Ton clair seulement.
- Chaque texte est posé sur une `.feuille` ou sur le fond, jamais sur un papier de couleur. Longueurs maximales du § 10.

## 1. Essence, et ce qu'il n'est pas

- Des couches : le fond, les strates de couleur, les feuilles blanches ; chacune a son ombre.
- Des bords faits main : coins inégaux, découpe un peu de travers.
- Une seule feuille soulevée à la fois : celle qui compte.
- Pas un style plat (`minimal`) : sans ombre, ce n'est plus du papier. Pas un papier découpé traditionnel rouge et or : les papiers de la charte, posés comme une maquette.

## 2. Matières et rendu

- `.feuille` : papier blanc, coins inégaux, un peu de travers, ombre à deux étages (`box-shadow`, jamais de filtre).
- `.souleve` : son ombre s'allonge avec `--p`. `.volet` : un papier posé dessus, qui se lève. `.pli` : un coin rabattu.
- Strates : `.colline` (`.loin`, `.pres`), chacune sa vitesse ; `.rond`. Grain : tuile `fibres.png`.

## 3. Logique de couleur

- Fond kraft clair ; feuilles blanches ; texte brun-noir.
- `--c-primaire` pour les strates et les volets ; `--c-accent` pour ce qui compte (`.compte`, le rond, les pastilles, la bande d'alerte).
- Jamais de texte sur un papier de couleur. Palette d'exemple (celle du style) : kraft `#ece2d0`, bleu-vert `#2c6870`, orange brûlé `#a8420f`.

## 4. Typographie et sous-titres

- **Archivo** 800 : titres (9,4 cqh, moyen 6,2), chiffres (20 cqh) ; **Nunito Sans** 400 : texte (3,9 cqh), 700 : étiquettes.
- Sous-titres sur une bande de papier blanc (`--pm-st-fond`). Lisibilité : `controles.md`.

## 5. Qualité du mouvement

- Posé : une feuille monte en 0,6 s (#002), se soulève en 2 à 3 s ; un volet part en 0,7 s.
- Rien ne rebondit fort ; les strates dérivent lentement, chacune à sa vitesse.
- Conseillés : #002, #017, #063, #001. Déconseillés : #028, #036, #042, #054.

## 6. Grammaire de caméra et transitions

| Mouvement | Ce qu'il exprime | Peut servir |
|---|---|---|
| Plan fixe | lire la maquette | presque toutes les scènes |
| Parallaxe (#063) | la profondeur des couches | une ouverture, un paysage |
| Zoom lent (#056) | s'approcher d'une feuille | un chiffre, un détail |

- De face ; une caméra qui bouge doit garder les strates hors du texte. Transitions : `glissement` (la feuille suivante glisse), `fondu`. À éviter : `whip`, `glitch`.
- Shaders conseillés, jamais imposés : `grain` très léger.

## 7. Palette sonore

- Ambiance `acoustique` par défaut, `inspirant` en alternative.
- Bruitages : forme, tracé et écriture → `papier` (froissé ou glissé) ; point → `pop` ; chiffre → `tic`.
- Matière : `papier`. Moment fort : `carillon`. Toute feuille qui se pose a son son ; 1 à 3 sons par scène.

## 8. Gestes natifs

- **La feuille qui se soulève.** *Recette :* `.feuille.souleve` avec un `data-dur` (l'ombre s'allonge avec `--p`). *Convient à :* la bonne option ; le titre ; une citation.
- **Le volet qui révèle.** *Recette :* `.volet` dans une `.feuille`, son propre `data-start` et `data-dur`. *Convient à :* un chiffre ; une surprise ; la réponse d'un quiz.
- **Le décor en strates.** *Recette :* `.colline.loin`, `.colline`, `.colline.pres`, chacune son `--x`, ou `data-profondeur` sous une caméra (#063). *Convient à :* un paysage ; une ouverture ; un territoire.

## 9. Pièges

- Des ombres noires et dures écrasent le papier : garder l'ombre brune du style.
- Plus de quatre couches, ou un texte sur un papier de couleur : on ne lit plus.
- Une feuille penchée de plus de 1° : le texte semble tomber. Export : ni filtre, ni `mix-blend-mode`.

## 10. Scènes toutes faites et classes

| Scène | Rôle | Durée | Textes (longueur maximale) |
|---|---|---|---|
| `titre` | Strates, puis la bande du titre qui se soulève | 7 s | etiquette 22, titre 30, sous 46 |
| `liste` | 2 à 4 points sur une feuille | 12 s | titre 30, point1 … point4 36 |
| `chiffre` | Un volet révèle le chiffre | 7 s | titre 30, unite 3, legende 46 ; `nombre 0→…` |
| `comparaison` | Deux feuilles, l'une révélée puis soulevée | 12 s | titre 30, gauche-titre et droite-titre 16, gauche-texte et droite-texte 48 |
| `etape` | Le rond du numéro, puis la feuille | 8 s | numero 2, titre 30, texte 64 |
| `alerte` | Feuille pliée, bande d'accent | 8 s | titre 30, texte 64 |
| `schema` | Trois feuilles reliées | 8 s | titre 30, a, b, c 16 |
| `moyeu` | Centre et parties | 10 s | titre 30, centre 18, parties 16 |
| `conclusion` | À retenir sur sa bande, logo | 6 s | titre 30, sous 44 |

Point ou logo absent : retirer son élément et sa clé.
- Texte : `.titre`, `.titre-moyen`, `.texte`, `.etiquette`, `.nombre`, `.compte`.
- Papier : `.feuille`, `.souleve`, `.volet`, `.pli`, `.bandeau`, `.colline`, `.rond`. Scènes : `.points`, `.feuilles`, `.vignette`, `.numero`, `.cadre-alerte`, `.chaine`, `.idee`.

Scène composée : ces classes et `<style>@scope { … }</style>`.

## 11. Espace de variation

- Claude décide pour chaque vidéo : la feuille soulevée de chaque scène, ce que cache un volet, les couleurs des strates.
- Structures : la maquette se construit couche après couche ; trois feuilles, trois offres ; avant le volet, après le volet.
- Ouvertures : les strates qui se posent ; une feuille qui arrive ; un volet sur le titre.
- Fins : la bande du titre soulevée ; toutes les feuilles posées ; le logo sur la dernière feuille.
- Usages : présenter une offre ou un service ; accueillir et présenter une équipe ; raconter un projet en étapes.
