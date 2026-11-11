# Style « crayon »

> Une page d'album dessinée en direct au crayon gras sur un papier à grain : la cire ne prend que sur les bosses du papier, un lavis translucide passe dessous et révèle ce qu'elle cachait.
> Sources : lemo-opuscar, `crayon-book` (MIT, © 2026 LemoLab) ; take-one, `crayon-storybook` (MIT) ; adaptés.

## L'essentiel

- Partir d'une des **9 scènes toutes faites** (`pulse-motion scene crayon <type>`) ; le `type` noté au déroulé permet de changer de style sans réécrire la scène.
- Décor (`.page`, `.crayons`, `data-decor`) : `data-dur="scene"`. Sur la **dernière scène**, il s'arrête 1 s avant la fin : image stable d'au moins 0,5 s.
- Formats 16:9, 1:1, 4:5 et 9:16. Ton clair seulement.
- Les titres s'écrivent (`data-lettres="ecrit"`, un `data-dur`) ; les textes montent par mots. Longueurs maximales du § 10.

## 1. Essence, et ce qu'il n'est pas

- Le crayon gras qui accroche le grain : des traits granuleux, jamais nets ; deux crayons qui se croisent se mêlent.
- Le lavis : une eau colorée qui passe sous la cire et la laisse apparaître.
- Une page d'album : grandes lettres rondes, peu de mots, des crayons posés au bord.
- Pas `carnet` : de la cire et du lavis, ni encre ni hachures. Pas `tableau-noir` : du papier, pas d'ardoise.

## 2. Matières et rendu

- Cire : `data-fleche`, `data-annoter`, redessinés dans le canevas du style (module `encre`, `--pm-encre: cire`) : le grain du papier décide où la cire prend. Repli : encre du calque, opaque à 0,94.
- Les traits frémissent à 10 Hz (#113), jamais un texte.
- `.lavis` (`.chaud` : à l'accent) : derrière un bloc, découvert de gauche à droite.
- Papier : tuile `papier.png`. `.page` : ombre du bord. `.crayons` : crayons qui roulent image par image.

## 3. Logique de couleur

- Papier crème fixe ; texte brun-noir. Boîte de huit crayons : `--c-primaire`, `--c-accent` et leurs versions lisibles, plus brun, ocre, vert et gris chauds (`data-couleur="crayon-ocre"`, `crayon-vert`, `crayon-brun`, `crayon-gris`).
- L'accent pour ce qui compte (`.compte`, l'entouré) ; le primaire pour le lavis froid et les étiquettes.
- Trois crayons au plus par scène. Palette d'exemple (celle du style) : papier `#f5eedf`, rouge `#b63c24`, bleu `#2a6592`.

## 4. Typographie et sous-titres

- **Fredoka** 600 : titres (9,6 cqh, moyen 6,4), chiffres (21 cqh), notes ; **Nunito Sans** 400 : texte (3,9 cqh), 700 : étiquettes.
- Sous-titres sur papier éclairci (`--pm-st-fond`). Lisibilité : `controles.md`.

## 5. Qualité du mouvement

- Lent et doux : un titre s'écrit en 1,8 s, le lavis passe en 1 s, puis le crayon souligne ou entoure (#115, #116).
- Les objets bougent image par image (#013), jamais en glissé parfait.
- Conseillés : #011, #017, #113, #117. Déconseillés : #001, #028, #036, #042.

## 6. Grammaire de caméra et transitions

| Mouvement | Ce qu'il exprime | Peut servir |
|---|---|---|
| Plan fixe sur la page | lire l'album | presque toutes les scènes |
| Zoom lent (#056) | se pencher sur un dessin | un chiffre, un mot entouré |
| Page qui tourne (#049) | passer à la page suivante | une nouvelle partie |

- Toujours de face, comme un livre ouvert. Transitions : `retournement` (la page qui tourne), `fondu`. À éviter : `whip`, `coupe`, `zoom`.
- Shaders conseillés, jamais imposés : `grain` très léger.

## 7. Palette sonore

- Ambiance `acoustique` par défaut (pour une partition propre, la corde au préréglage kalimba), `calme` en alternative.
- Bruitages : écriture et tracé → `crayon` (un son tenu) ; point → `pop` ; chiffre → `tic`.
- Matière : `crayon`. Moment fort : `carillon`. Tout crayon qui touche la page a son son ; 1 à 3 sons par scène.

## 8. Gestes natifs

- **Le lavis qui révèle.** *Recette :* `.lavis` (ou `.lavis.chaud`) derrière le bloc, `data-start="#titre:fin"`, puis `data-annoter`. *Convient à :* un chiffre clé ; le titre d'un chapitre ; la bonne réponse.
- **Le dessin en direct.** *Recette :* `data-lettres="ecrit"`, puis `data-annoter="entoure"` à l'accent (#116). *Convient à :* une règle à retenir ; un mot nouveau ; une étape.
- **La page qui tourne.** *Recette :* transition `retournement` (#049). *Convient à :* un nouveau chapitre ; avant et après ; la fin de l'histoire.

## 9. Pièges

- Un texte qui frémit devient illisible : seuls les traits frémissent.
- Un lavis partout ne révèle plus rien : un par scène.
- Plus de trois crayons par scène. Export : ni `mix-blend-mode`, ni filtre SVG.

## 10. Scènes toutes faites et classes

| Scène | Rôle | Durée | Textes (longueur maximale) |
|---|---|---|---|
| `titre` | Titre écrit, lavé, souligné | 7 s | etiquette 22, titre 30, sous 46 |
| `liste` | 2 à 4 points, une tache de cire devant | 12 s | titre 30, point1 … point4 36 |
| `chiffre` | Chiffre entouré, révélé par le lavis | 7 s | titre 30, unite 3, legende 46 ; `nombre 0→…` |
| `comparaison` | Deux pages, l'une lavée | 12 s | titre 30, gauche-titre et droite-titre 16, gauche-texte et droite-texte 48 |
| `etape` | Numéro entouré, puis l'action | 8 s | numero 2, titre 30, texte 64 |
| `alerte` | Note sur un lavis chaud, encadrée | 8 s | titre 30, texte 64 |
| `schema` | Trois idées reliées | 8 s | titre 30, a, b, c 16 |
| `moyeu` | Centre et parties | 10 s | titre 30, centre 18, parties 16 |
| `conclusion` | À retenir, lavé, souligné, logo | 6 s | titre 30, sous 44 |

Point ou logo absent : retirer son élément et sa clé.
- Texte : `.titre`, `.titre-moyen`, `.texte`, `.etiquette`, `.nombre`, `.compte`, `.note`.
- Scènes : `.bloc-titre`, `.lavis`, `.points`, `.pages`, `.vignette`, `.numero`, `.cadre-alerte`, `.chaine`, `.idee`. Module : `encre`.

Scène composée : ces classes et `<style>@scope { … }</style>`.

## 11. Espace de variation

- Claude décide pour chaque vidéo : ce que le lavis révèle, les trois crayons de chaque scène, ce qui s'entoure.
- Structures : il était une fois → le problème → la solution ; trois pages d'un même album ; la question d'un enfant → la réponse.
- Ouvertures : le titre qui s'écrit ; un dessin qui se fait ; un lavis qui révèle un mot.
- Fins : la morale soulignée ; la dernière page ; le chiffre révélé.
- Usages : sensibiliser le grand public ; raconter une histoire simple ; expliquer à des enfants ou des familles.
