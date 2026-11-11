# Style « recit-donnees »

> Le graphique est le film : des données réelles, fournies par la personne, et chaque mouvement est une opération du graphique (un point arrive, un axe pousse, une note s'épingle).
> Sources : lemo-opuscar, `dataviz` (MIT, © 2026 LemoLab) ; adapté.

## L'essentiel

- Partir d'une des **9 scènes toutes faites** (`pulse-motion scene recit-donnees <type>`) ; le `type` noté au déroulé permet de changer de style sans réécrire la scène.
- Décor (`.crayon`, `data-decor`) : `data-dur="scene"`. Sur la **dernière scène**, il s'arrête 1 s avant la fin : image stable d'au moins 0,5 s.
- Formats 16:9, 1:1, 4:5 et 9:16. Ton clair seulement.
- Des valeurs à montrer : un graphique du déroulé (`<figure data-graphique>`, `pulse-motion reference explication`) ; jamais une valeur inventée. Longueurs maximales du § 10.

## 1. Essence, et ce qu'il n'est pas

- Papier crème à grille de points, encre chaude, axes qui poussent avec l'histoire, une valeur à l'accent, notes manuscrites épinglées, la pointe d'un crayon rouge et bleu, une case vide en pointillés pour ce qu'on ne sait pas.
- Pas un tableau de bord : une idée à la fois. Pas une présentation avec des graphiques : le graphique est le récit lui-même. Pas `plan-technique` : des données, pas une pièce.

## 2. Matières et rendu

- Graphiques du calque de dessin (#122 barres qui poussent, #123 courbe qui se trace, #124 anneau) : leurs étiquettes, valeurs et source sont des textes jugés.
- Scènes toutes faites : `.axe-y` et `.axe-x` tracés par `--p`, `.barre` qui pousse depuis zéro, points de `.faits`, `.note` épinglée, `.case-vide`, `.crayon` et son ombre.

## 3. Logique de couleur

- `--c-primaire` de la charte pour la série principale ; `--c-accent` pour la valeur qui compte, une par scène ; gris chaud pour la grille ; encre pour les axes.
- Une couleur ne dit qu'une chose : jamais deux séries de la même couleur. Palette d'exemple (celle du style) : encre `#2a2723`, bleu `#2c5d8a`, rouge `#c0392b`.

## 4. Typographie et sous-titres

- **Schibsted Grotesk** 700 : titres (9 cqh, moyen 6), étiquettes ; 900 : chiffres (22 cqh, `tabular-nums`) ; **Fraunces** 400 : texte (4 cqh), italique : notes.
- Sous-titres du moteur. Lisibilité : `controles.md`.

## 5. Qualité du mouvement

- `cubic-out`, 0,5 à 0,9 s ; chaque mouvement est une opération : l'axe se trace, le point arrive, la barre pousse, la note se pose.
- Le crayon se lève et se repose une fois par scène ; rien d'autre ne bouge pour décorer.
- Conseillés : #011, #021, #122, #123, #124. Déconseillés : #001, #028, #036, #020.

## 6. Grammaire de caméra et transitions

| Mouvement | Ce qu'il exprime | Peut servir |
|---|---|---|
| Plan fixe | lire le graphique | presque toutes les scènes |
| Zoom sur un détail (#037) | regarder une valeur de près | un point, une note |
| Recul (#128) | voir toute la série | la fin d'une évolution |

- Le graphique reste droit ; la caméra ne bouge pas pendant qu'un point arrive.
- Transitions : `glissement`, `fondu`. À éviter : `whip`, `zoom`, `retournement`.
- Shaders conseillés, jamais imposés : aucun.

## 7. Palette sonore

- Ambiance `inspirant` par défaut, `calme` en alternative.
- Bruitages : point → `blip` (une note dans la gamme de la musique, point après point) ; chiffre → `tic` ; tracé → `crayon`.
- Matière : `crayon`. Moment fort : `ding`. Le silence avant la valeur qui compte.

## 8. Gestes natifs

- **Un point, un fait.** *Recette :* `.faits` ; dans un graphique, `debut: "mot:…"` pour chaque barre (#122). *Convient à :* une chronologie ; trois résultats ; des étapes.
- **L'axe qui pousse.** *Recette :* `.axe-x`, `.axe-y` (`--p`), au mot de l'unité. *Convient à :* une ouverture ; une évolution ; une nouvelle échelle.
- **La note épinglée.** *Recette :* `.note`. *Convient à :* une source ; une explication ; une valeur à retenir.
- **La case vide.** *Recette :* `.case-vide`. *Convient à :* une valeur inconnue ; une limite ; ce qu'il ne faut pas conclure.

## 9. Pièges

- Extrapoler, ou une barre qui donne une proportion fausse : seules les données du déroulé ont une taille.
- Axe qui ne part pas de zéro sans le dire ; chiffre sans source : vérité des chiffres, `pulse-motion reference realisation`.
- Trop de séries : une idée par graphique. Export : ni `mix-blend-mode`, ni filtre SVG.

## 10. Scènes toutes faites et classes

| Scène | Rôle | Durée | Textes (longueur maximale) |
|---|---|---|---|
| `titre` | Axes, titre, question épinglée | 7 s | etiquette 22, titre 32, sous 46 |
| `liste` | Un point, un fait | 12 s | titre 32, point1 … point4 36 |
| `chiffre` | La valeur pousse depuis zéro | 7 s | titre 32, unite 3, legende 46 ; `nombre 0→…` |
| `comparaison` | Deux séries, l'une à l'accent | 12 s | titre 32, gauche-titre et droite-titre 16, gauche-texte et droite-texte 48 |
| `etape` | Un repère sur l'axe du temps | 8 s | numero 2, titre 32, texte 64 |
| `alerte` | La case vide | 8 s | titre 32, texte 64 |
| `schema` | Trois étapes d'un flux | 8 s | titre 32, a, b, c 16 |
| `moyeu` | Centre et parties | 10 s | titre 32, centre 18, parties 16 |
| `conclusion` | La leçon des chiffres, logo | 6 s | titre 32, sous 44 |

Point ou logo absent : retirer son élément et sa clé.
- Texte : `.titre`, `.titre-moyen`, `.texte`, `.etiquette`, `.note`, `.nombre`, `.compte`, `.arrive`.
- Scènes : `.repere`, `.faits`, `.mesure`, `.series`, `.serie`, `.numero`, `.chaine`, `.noeud`.

Scène composée : ces classes et `<style>@scope { … }</style>`.

## 11. Espace de variation

- Claude décide pour chaque vidéo : le graphique de chaque donnée (table d'`explication`), la valeur qui compte, les notes épinglées.
- Structures : la question → les données → la réponse ; avant → après → pourquoi ; une évolution, point par point.
- Ouvertures : les axes qui se tracent ; un seul point ; la question épinglée.
- Fins : la valeur qui compte ; la série complète ; la leçon des chiffres.
- Usages : raconter un bilan chiffré ; comparer des résultats ; suivre une évolution.
