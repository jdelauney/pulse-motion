# Style « riso »

> L'impression risographique : deux ou trois encres translucides surimprimées sur un papier chaud, une trame de points, un grain d'encre, des plaques jamais tout à fait calées ; le texte dans l'encre la plus sombre.
> Sources : lemo-opuscar, `risograph` (MIT, © 2026 LemoLab) ; take-one, `riso-pop` (MIT) ; adaptés.

## L'essentiel

- Partir d'une des **9 scènes toutes faites** (`pulse-motion scene riso <type>`) ; le `type` noté au déroulé permet de changer de style sans réécrire la scène.
- Décor (`.aplat`, `.grain`, `data-decor`) : `data-dur="scene"`. Sur la **dernière scène**, il s'arrête 1 s avant la fin : image stable d'au moins 0,5 s.
- Formats 16:9, 1:1, 4:5 et 9:16. Ton clair seulement.
- Tout texte en `--c-texte`, l'encre la plus sombre ; ce qui compte se surligne (`data-annoter="surligne"`, `data-couleur="encre-neutre"`). Longueurs maximales du § 10.

## 1. Essence, et ce qu'il n'est pas

- Des encres qui se superposent et se mêlent (le rose sur le bleu fait un violet), jamais des aplats opaques.
- Une trame de points, un grain d'encre, un papier chaud.
- Chaque plaque est un peu décalée, la même pour tout le plan.
- Pas `energique` : peu de mouvement, des encres qui se posent. Pas `minimal` : des encres, de la matière, de l'imperfection.

## 2. Matières et rendu

- `.aplat` et `data-riso="<forme> <encre> [trame]"` (`rond`, `rect`, `demi`, `bande` ; `primaire`, `accent`, `neutre`) : peints par le module `riso`, une couche par encre, en multiply. Repli : aplats HTML translucides.
- `data-fleche`, `data-annoter` : encre riso (module `encre`, `--pm-encre: riso`), une couche par couleur.
- Calage de 0,2 à 0,5 cqh par encre, constant dans le plan ; `.calage` (`data-riso-calage`) le rattrape. `.grain` : tuile `grain.png`.

## 3. Logique de couleur

- Trois encres au plus : `--c-primaire`, `--c-accent` et une encre claire, `--c-encre-neutre` (jaune) pour les fonds et les surlignages.
- Le texte n'a qu'une couleur : `--c-texte`, la plus sombre. Jamais de texte sur l'encre d'accent pleine.
- Palette d'exemple (encres de take-one) : jaune `#F4C51A`, rose `#F0508C`, bleu `#2160A8`, papier `#E6DECB`.

## 4. Typographie et sous-titres

- **Schibsted Grotesk** 900 : titres (10 cqh, moyen 6,4), chiffres (22 cqh) ; 400 : texte (3,9 cqh) ; 700 : étiquettes.
- Sous-titres sur papier éclairci, dans l'encre du texte (`--pm-st-*`). Lisibilité : `controles.md`.

## 5. Qualité du mouvement

- Vif et bref : un aplat se pose en 0,45 s (#001, #003), un mot monte (#017), une coupe tombe sur le temps.
- Le décalage des plaques ne change jamais au cours d'un plan ; il se rattrape sur un temps fort.
- Conseillés : #001, #003, #017, #050. Déconseillés : #033, #036, #054, #013.

## 6. Grammaire de caméra et transitions

| Mouvement | Ce qu'il exprime | Peut servir |
|---|---|---|
| Plan fixe | lire l'affiche | presque toutes les scènes |
| Zoom sur un détail (#037) | la trame qui grossit | un chiffre, un aplat |
| Coupe sèche (#050) | tourner la page du fanzine | une nouvelle partie |

- Cadre d'affiche : de grandes formes coupées par le bord. Transitions : `coupe`, `glissement`. À éviter : `fondu` long, `dissolution`.
- Shaders conseillés, jamais imposés : `grain` très léger.

## 7. Palette sonore

- Ambiance `entrainant` par défaut, `inspirant` en alternative.
- Bruitages : titre → `clic` ; forme et point → `pop` ; chiffre → `tic` ; tracé et écriture → `papier`.
- Matière : `papier`. Moment fort : `impact`. Une encre qui se pose a son son ; 1 à 3 sons par scène.

## 8. Gestes natifs

- **Chaque étape ajoute une encre.** *Recette :* un `.aplat` par point, `data-start="#point2"`, une autre encre à chaque fois. *Convient à :* une liste ; un processus ; une montée en charge.
- **Le calage qui se rattrape.** *Recette :* `.calage` avec `data-riso-calage` sur un temps fort. *Convient à :* une conclusion ; une révélation ; un logo.
- **La trame qui grossit.** *Recette :* un aplat `trame`, zoom #037. *Convient à :* un chiffre ; un détail ; une marque.

## 9. Pièges

- Plus de trois encres, ou un texte clair : ce n'est plus du riso.
- Un texte sur l'encre d'accent pleine : contraste trop faible ; formes à l'écart du texte.
- Un calage qui change à chaque image tremble. Export : ni `mix-blend-mode`, ni filtre SVG.

## 10. Scènes toutes faites et classes

| Scène | Rôle | Durée | Textes (longueur maximale) |
|---|---|---|---|
| `titre` | Les encres, puis le titre surligné | 7 s | etiquette 22, titre 30, sous 46 |
| `liste` | Chaque point ajoute une encre | 12 s | titre 30, point1 … point4 36 |
| `chiffre` | Chiffre souligné à l'accent | 7 s | titre 30, unite 3, legende 46 ; `nombre 0→…` |
| `comparaison` | Deux colonnes, deux encres | 12 s | titre 30, gauche-titre et droite-titre 16, gauche-texte et droite-texte 48 |
| `etape` | Numéro sur un rond clair | 8 s | numero 2, titre 30, texte 64 |
| `alerte` | Aplat clair encadré | 8 s | titre 30, texte 64 |
| `schema` | Trois idées reliées | 8 s | titre 30, a, b, c 16 |
| `moyeu` | Centre et parties | 10 s | titre 30, centre 18, parties 16 |
| `conclusion` | Les plaques se calent, logo | 6 s | titre 30, sous 44 |

Point ou logo absent : retirer son élément, sa clé et son aplat.
- Texte : `.titre`, `.titre-moyen`, `.texte`, `.etiquette`, `.nombre`.
- Décor : `.soleil`, `.colline`, `.pastille`, `.ruban`. Scènes : `.points`, `.colonnes`, `.colonne`, `.bloc-numero`, `.numero`, `.cadre-alerte`, `.chaine`, `.idee`.

Scène composée : ces classes et `<style>@scope { … }</style>`.

## 11. Espace de variation

- Claude décide pour chaque vidéo : l'encre de chaque forme, ce qui se surligne, le temps fort où les plaques se calent.
- Structures : une encre, puis deux, puis trois ; l'affiche qui se compose ; trois cartes du fanzine.
- Ouvertures : le rond rose qui tombe ; le titre sur un aplat ; une coupe sur le temps.
- Fins : les plaques qui se calent ; le logo surimprimé ; le chiffre souligné.
- Usages : annoncer un événement ; publier sur les réseaux ; donner du caractère à une marque.
