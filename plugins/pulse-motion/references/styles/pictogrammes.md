# Style « pictogrammes »

> Un film calé sur les temps, fait de trois choses seulement : une grille-motif de ronds, de demi-disques et de petites cellules dont les rangées glissent, des pictogrammes géométriques, une typographie de signalétique.
> Sources : lemo-opuscar, `pictogram-motion` (MIT, © 2026 LemoLab) ; pictogrammes dessinés pour Pulse Motion ; adaptés.

## L'essentiel

- Partir d'une des **9 scènes toutes faites** (`pulse-motion scene pictogrammes <type>`) ; le `type` noté au déroulé permet de changer de style sans réécrire la scène.
- Décor (`.motif`, `data-decor`) : `data-dur="scene"` et `data-tween="--d 0→<deux fois la durée> linear"`. Sur la **dernière scène**, il s'arrête 1 s avant la fin : image stable d'au moins 0,5 s.
- Formats 16:9, 1:1, 4:5 et 9:16. Ton clair seulement.
- Tout se pose sur un temps de 0,5 s (avec un tempo : `data-start="2t"`). Longueurs maximales du § 10.

## 1. Essence, et ce qu'il n'est pas

- Trois éléments, jamais un quatrième : la grille-motif, les pictogrammes, la typographie de panneau.
- Tout tombe sur les temps : une chose par temps, une rangée glisse d'une cellule par temps.
- Des pictogrammes géométriques, pleins, d'une seule couleur ; jamais une illustration.
- Pas `iso-infographie` : tout est plat, de face. Pas des icônes d'interface : des panneaux, une grille et des temps.

## 2. Matières et rendu

- `.picto` et sa forme, `.picto-camion` par exemple (personne, camion, maison, horloge, soleil, nuage, goutte, flocon, attention, interdit, info, fleche, coche, croix, thermometre, colis) : masques SVG, couleur du texte.
- `.motif` : trois `.rangee` qui glissent d'une cellule par temps, puis tiennent ; arrêtées avec le décor. Flèches nettes.

## 3. Logique de couleur

- Fond blanc cassé, texte presque noir ; deux couleurs seulement en plus.
- `--c-primaire` pour les panneaux et la première rangée ; `--c-accent` pour ce qui alerte ou compte (`.alerte-panneau`, `.compte`) et la deuxième rangée.
- Un pictogramme n'a qu'une couleur. Palette d'exemple (celle du style) : fond `#f3f1ea`, bleu `#1f5fa0`, orange `#c43a1a`.

## 4. Typographie et sous-titres

- **Barlow Condensed** 800, en capitales : titres (10 cqh, moyen 6,6), chiffres (22 cqh) ; **Barlow** 500 : texte (3,9 cqh), 700 : étiquettes.
- Sous-titres en bandeau sombre, comme un panneau (`--pm-st-fond`). Lisibilité : `controles.md`.

## 5. Qualité du mouvement

- Net et bref, sur le temps : un panneau se pose en 0,25 s, un texte se démasque (#006), un point glisse (#003).
- Le compte : une silhouette toutes les 0,12 s. Un pictogramme en devient un autre (#031) sur un temps.
- Conseillés : #001, #006, #010, #031. Déconseillés : #013, #026, #033, #062.

## 6. Grammaire de caméra et transitions

| Mouvement | Ce qu'il exprime | Peut servir |
|---|---|---|
| Plan fixe | lire le panneau | presque toutes les scènes |
| Coupe sur le temps (#050) | passer d'une carte à l'autre | le film catalogue |
| Volets (#046) | changer de panneau | une nouvelle partie |
| Zoom sur un signe (#037) | montrer le pictogramme | un panneau, un chiffre |

- De face, sans perspective. Transitions : `coupe` sur un temps, `volets`. À éviter : `fondu` lent, `whip`.
- Shaders conseillés, jamais imposés : aucun.

## 7. Palette sonore

- Ambiance `entrainant` par défaut, `corporate` en alternative ; une musique à tempo cale les temps.
- Bruitages : titre → `clic` ; point et chiffre → `tic` ; forme → `pop`.
- Matière : aucune. Moment fort : `ding`. Un son par temps fort, 1 à 3 par scène.

## 8. Gestes natifs

- **Le film catalogue.** *Recette :* `.catalogue` de `.panneau`, chacun `--i` (un par temps). *Convient à :* un sommaire ; une gamme de services ; les étapes d'un trajet.
- **Les rangées qui glissent.** *Recette :* `.motif`, `--d` sur le décor. *Convient à :* un fond qui bat ; une attente ; un générique.
- **Un pictogramme qui devient un autre.** *Recette :* `.devient`, deux `.panneau` (#031). *Convient à :* avant et après ; un problème résolu ; un changement.
- **Le compte en pictogrammes.** *Recette :* `.compte-pictos`, chaque `.picto` son `--i`. *Convient à :* un effectif ; une proportion ; un public.

## 9. Pièges

- Un mouvement entre deux temps fait perdre le pas : débuts sur les demi-secondes, ou en `t`.
- Un pictogramme par idée, d'une couleur. Une rangée sous un texte : garder `.motif` en bas.
- Export : ni `mix-blend-mode` ni filtre.

## 10. Scènes toutes faites et classes

| Scène | Rôle | Durée | Textes (longueur maximale) |
|---|---|---|---|
| `titre` | Film catalogue, puis titre | 7 s | etiquette 22, titre 30, sous 46 |
| `liste` | Un point par temps | 12 s | titre 30, point1 … point4 36 |
| `chiffre` | Compte en pictogrammes | 7 s | titre 30, unite 3, legende 46 ; `nombre 0→…` |
| `comparaison` | La croix, la coche | 12 s | titre 30, gauche-titre et droite-titre 16, gauche-texte et droite-texte 48 |
| `etape` | Numéro sur son disque | 8 s | numero 2, titre 30, texte 64 |
| `alerte` | Panneau « attention » | 8 s | titre 30, texte 64 |
| `schema` | Trois cases reliées | 8 s | titre 30, a, b, c 16 |
| `moyeu` | Centre et parties | 10 s | titre 30, centre 18, parties 16 |
| `conclusion` | La flèche devient coche | 6 s | titre 30, sous 44 |

Point ou logo absent : retirer son élément et sa clé.
- Texte : `.titre`, `.titre-moyen`, `.texte`, `.etiquette`, `.nombre`, `.compte`.
- Signes : `.panneau`, `.alerte-panneau`, `.catalogue`. Scènes : `.points`, `.signaux`, `.signal`, `.numero`, `.cadre-alerte`, `.chaine`, `.idee`.

Scène composée : ces classes et `<style>@scope { … }</style>`.

## 11. Espace de variation

- Claude décide pour chaque vidéo : les pictogrammes de chaque scène, le pas (0,5 s ou le tempo de la musique), ce qui passe à l'accent.
- Structures : le catalogue → le détail → la consigne ; un pictogramme par étape ; le chiffre en silhouettes → ce qu'il veut dire.
- Ouvertures : le film catalogue ; un panneau seul ; les rangées qui démarrent.
- Fins : la coche ; le compte complet ; le panneau du service.
- Usages : donner une consigne ou un mode d'emploi ; présenter un service public ou interne ; montrer une quantité en silhouettes.
