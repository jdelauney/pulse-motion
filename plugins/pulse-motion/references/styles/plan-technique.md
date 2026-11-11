# Style « plan-technique »

> Un dessin technique qui s'anime sur papier cyanotype : trait blanc cassé sur bleu de Prusse, tracé à la règle dans l'ordre du dessinateur (cadre, axes, contours, détails, cotes), une seule pièce à l'accent.
> Sources : lemo-opuscar, style `blueprint` (MIT, © 2026 LemoLab) ; explainroo, look `blueprint` (MIT) ; traduits et adaptés.

## L'essentiel

- Partir d'une des **9 scènes toutes faites** (`pulse-motion scene plan-technique <type>`) ; le `type` noté au déroulé permet de changer de style sans réécrire la scène.
- Décor (`.grille`, `data-decor`) : `data-dur="scene"`. Sur la **dernière scène**, il s'arrête 1 s avant la fin : image stable d'au moins 0,5 s.
- Formats 16:9, 1:1, 4:5 et 9:16. Ton sombre (cyanotype) par défaut ; clair (calque blanc, trait bleu) sur demande.
- Une pièce à l'accent par scène ; longueurs maximales du § 10.

## 1. Essence, et ce qu'il n'est pas

- Fond bleu de Prusse et grille fine ; tout se trace devant nous, dans l'ordre ; lettrage en capitales ; cartouche, repères numérotés dans un cercle, cotes fléchées, hachures de coupe, nuage de révision.
- Pas `tech-sombre` : ni interface, ni clavier, ni texte tapé. Pas un tableau blanc : trait à la règle, sans main. Pas une infographie isométrique : des lignes, pas des blocs de couleur.

## 2. Matières et rendu

- HTML et CSS, sans SVG ni texture : chaque trait est un dégradé dont la longueur suit `--p` de son élément. Trois épaisseurs : contour 0,35 cqh, détail 0,2, cote 0,12 (jamais moins).
- `.grille` : lignes à 5 % tous les 4 cqh, à 9 % tous les 20 cqh, qui glissent très lentement ; `.cadre` et `.axe` se tracent en ouverture.

## 3. Logique de couleur

- Fond bleu sombre, trait blanc cassé ; `--c-accent` de la charte pour une seule pièce, « celle qui compte » (`.piece.compte`), sa cote et le nuage de révision ; `--c-primaire` pour le cartouche et les repères.
- Rien d'autre n'est coloré ; jamais d'aplat.
- Ton clair : fond `#f3f6fa`, trait `#123c69`. Palette d'exemple (celle du style) : bleu de Prusse `#123c69`, ciel `#a9d6f5`, ambre `#ffb347`.

## 4. Typographie et sous-titres

- Polices fournies : **B612** 700, titres en capitales (7,4 cqh, moyen 5) et repères ; **B612 Mono** 400, texte (3,6 cqh), cotes et chiffres (20 cqh, `tabular-nums`).
- Sous-titres : habillage du moteur ; lisibilité : `controles.md`.

## 5. Qualité du mouvement

- Précis : `cubic-inout`, 0,6 à 1,2 s par contour ; le texte s'encre à la fin du tracé de sa pièce ; rien ne rebondit.
- Ordre : cadre, axes, titre, contours, détails, cotes ; une chose tracée à la fois.
- Conseillés : #011, #021, #006. Déconseillés : #028, #001, #036.

## 6. Grammaire de caméra et transitions

| Mouvement | Ce qu'il exprime | Peut servir |
|---|---|---|
| Zoom avant lent (#056) | s'approcher du détail | une pièce, une cote |
| Panoramique (#057) | suivre une pièce | un arbre de transmission, une ligne de montage |
| Zoom sur un détail (#037) | inspecter | un repère, une tolérance |
| Plan fixe | lire le plan | la plupart des scènes |

- Le cadre reste droit : ni plan incliné, ni caméra à l'épaule.
- Transitions : `balayage`, `glissement`, `coupe`. À éviter : `zoom`, `retournement`, `whip`.
- Shaders conseillés, jamais imposés (WebGPU) : `grain` très léger, pour le papier.

## 7. Palette sonore

- Ambiance `mecanique` par défaut, `tech` en alternative.
- Bruitages : trace → `crayon` (la matière du style) ; chiffre → `tic` ; forme → `whoosh` (une pièce qui s'écarte) ; les autres entrées sans son propre.
- Matière : `crayon`. Moment fort : `ding`.
- Le tracé d'un contour a son grain ; pas de son pour chaque lettre.

## 8. Gestes natifs

- **Le plan se dessine dans l'ordre.** *Recette :* `.cadre`, `.axe`, puis `.piece` (`data-dur` 0,8 à 1,2 s), puis `.cote` (#011). *Convient à :* présenter une machine ; ouvrir une formation ; montrer une pièce neuve.
- **La cote qui s'étire.** La cote suit la valeur. *Recette :* `.cote.accent` et `nombre 0→…` (#021) avec le même `data-start` et la même `data-dur`. *Convient à :* une dimension ; une tolérance ; un écart de mesure.
- **La coupe hachurée.** *Recette :* `.coupe`, sa largeur suit `--p`. *Convient à :* l'intérieur d'une pièce ; une épaisseur ; une proportion.
- **Le nuage de révision.** Ce qui a changé, entouré à l'accent. *Recette :* `.nuage`, déroulé par `--p`. *Convient à :* une modification ; un point de contrôle ; une nouveauté de version.
- **Le repère au compas.** *Recette :* `.ballon` ou `.nomenclature`. *Convient à :* une étape ; une pièce de la nomenclature ; un point d'inspection.

## 9. Pièges

- Trait trop fin : jamais sous 0,12 cqh, illisible en 720p.
- L'accent sur plusieurs pièces : il n'en désigne plus aucune.
- Trop de tracés à la fois : un contour à la fois, 0,2 à 0,4 s entre deux.
- Hachures derrière du texte : réserver `.coupe` aux pièces sans texte.
- Export : ni `mix-blend-mode`, ni filtre SVG ; les traits sont des dégradés, sûrs à l'export rapide.

## 10. Scènes toutes faites et classes

| Scène | Rôle | Durée | Textes (longueur maximale) |
|---|---|---|---|
| `titre` | Ouvrir sur le cadre, le cartouche et le titre | 7 s | etiquette 24, titre 36, sous 48 |
| `liste` | Une nomenclature de 2 à 4 repères | 12 s | titre 36, point1 … point4 40 |
| `chiffre` | Une mesure, sa cote et sa coupe | 7 s | titre 36, unite 3, legende 54 ; `nombre 0→…` |
| `comparaison` | Deux vues, celle qui compte à l'accent | 12 s | titre 36, gauche-titre et droite-titre 18, gauche-texte et droite-texte 56 |
| `etape` | Une étape, son repère au compas | 8 s | numero 2, titre 36, texte 72 |
| `alerte` | Un nuage de révision | 8 s | titre 36, texte 72 |
| `schema` | Trois pièces reliées | 8 s | titre 36, a, b, c 20 |
| `moyeu` | Centre et parties | 10 s | titre 36, centre 20, parties 18 |
| `conclusion` | La pièce à retenir et le logo | 6 s | titre 36, sous 48 |

Point ou logo absent : retirer son élément et sa clé.
- Texte : `.titre`, `.titre-moyen`, `.texte`, `.nombre`, `.unite`, `.cartouche`.
- Tracés : `.ecrit` (`--p`), `.piece` (`.compte`, `.nue`), `.piece-titre`, `.cote` (`.accent`), `.coupe`, `.ballon`, `.nuage`. Décor : `.decor` + `.grille`, `.cadre`, `.axe`.
- Scènes : `.nomenclature` ; `.mesure` ; `.vues` ; `.etape` ; `.chaine-pieces`, `.connecteur` ; `.logo`.

Scène composée : ces classes et `<style>@scope { … }</style>`.

## 11. Espace de variation

- Claude décide pour chaque vidéo : l'ordre des tracés, la pièce qui compte, les cotes montrées, le ton.
- Structures : la machine → ses pièces → la pièce qui compte ; le défaut → la cote → la correction ; trois étapes d'un montage.
- Ouvertures : le cadre qui se trace ; une cote qui s'étire ; un nuage sur ce qui a changé.
- Fins : la pièce à retenir ; la nomenclature complète ; le cartouche et le logo.
- Usages : expliquer une machine ou une pièce ; former à la maintenance ; présenter un procédé industriel.
