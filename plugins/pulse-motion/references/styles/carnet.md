# Style « carnet »

> Le carnet de croquis au feutre, sur papier crème : des traits qui tremblent un peu, dépassent et ne se ferment pas tout à fait ; la vidéo se dessine.
> Sources : explainroo, `paper` (MIT) ; take-one, `sketchbook` (MIT) ; lemo-opuscar, `one-line` (MIT, © 2026 LemoLab) ; adaptés.

## L'essentiel

- Partir d'une des **9 scènes toutes faites** (`pulse-motion scene carnet <type>`) ; le `type` noté au déroulé permet de changer de style sans réécrire la scène.
- Décor (`.fibres`, `data-decor`) : `data-dur="scene"`. Sur la **dernière scène**, il s'arrête 1 s avant la fin : image stable d'au moins 0,5 s.
- Formats 16:9, 1:1, 4:5 et 9:16. Ton clair seulement.
- Titres écrits (`data-lettres="ecrit"`, avec `data-dur`) ; textes posés (`data-mots="monte"`). Longueurs maximales du § 10.

## 1. Essence, et ce qu'il n'est pas

- Papier crème, grain fin, ombre de reliure ; traits à main levée qui frémissent ; hachures, puces dessinées, notes dans la marge ; une seule ligne qui fait le tour de ce qui compte.
- Pas `tableau-blanc` : du papier, pas de feutres flottants. Pas un dessin au crayon gras : de l'encre, sans cire ni lavis. Pas `chaleureux` : des traits dessinés, pas des cartes arrondies.

## 2. Matières et rendu

- Tracés du calque de dessin (`data-fleche`, `data-annoter`) à main levée : rugosité 1,15, courbure 1,2, trait 0,4 cqh, frémissement à 10 Hz (#112, #113). **Jamais un texte** : les textes restent immobiles.
- « Une seule ligne » : `data-une-ligne="#id …"` (module `une-ligne`), un trait continu qui fait le tour de chaque cible.
- `.hachures` (à −41°, posées par `--p`), `.fibres`, `.reliure`.

## 3. Logique de couleur

- Encre sombre pour tout ; `--c-accent` de la charte pour ce qui compte (hachures, une seule ligne, entourés) ; `--c-primaire` pour le second feutre (notes, puces, étiquettes).
- Pas d'aplat : la couleur vient des traits. Palette d'exemple (celle du style) : encre `#2b2622`, bleu `#2a6787`, sanguine `#ad3f28`.

## 4. Typographie et sous-titres

- **Caveat** 700 (écriture au feutre) : titres (10 cqh, moyen 6,6), chiffres, notes ; **Instrument Sans** 400 : texte (3,9 cqh), 600 : étiquettes.
- Sous-titres du moteur. Lisibilité : `controles.md`.

## 5. Qualité du mouvement

- Un trait après l'autre : le titre s'écrit, puis on l'entoure ou on le souligne ; le texte se pose ensuite.
- Frémissement de 8 à 12 Hz sur les traits seulement (`--pm-ebullition: 10`).
- Conseillés : #011, #112, #113, #116. Déconseillés : #001, #028, #036.

## 6. Grammaire de caméra et transitions

| Mouvement | Ce qu'il exprime | Peut servir |
|---|---|---|
| Plan fixe | regarder la page se dessiner | presque toutes les scènes |
| Zoom sur un détail (#037) | se pencher sur un croquis | un chiffre, une note |
| Panoramique (#057) | tourner l'œil vers la page voisine | une suite d'étapes |

- La page reste droite ; le mouvement vient des traits.
- Transitions : `fondu`, `balayage`. À éviter : `whip`, `zoom`, `coupe`.
- Shaders conseillés, jamais imposés : `grain` très léger, pour le papier.

## 7. Palette sonore

- Ambiance `acoustique`.
- Bruitages : écriture et tracé → `crayon` (la matière, un son tenu) ; point → `pop` ; chiffre → `tic`.
- Matière : `crayon`. Moment fort : `carillon`. Chaque trait qui touche le papier a son grain ; 1 à 3 sons par scène.

## 8. Gestes natifs

- **Une seule ligne.** *Recette :* `<i data-une-ligne="#titre">` avec `data-start` et `data-dur`, `data-couleur="accent-lisible"`. *Convient à :* un titre ; ce qu'il faut retenir ; trois idées reliées d'un trait.
- **Les hachures.** *Recette :* `.hachures` dans l'élément, `data-start` et `data-dur`. *Convient à :* un chiffre ; le bon choix ; une zone.
- **Entourer au mot.** *Recette :* `data-annoter="entoure"` ou `souligne`, `data-start="mot:…"` (#116, #115). *Convient à :* un mot-clé ; un résultat ; une réponse.
- **La note dans la marge.** *Recette :* `.note`. *Convient à :* une remarque ; une astuce ; une citation.

## 9. Pièges

- Frémissement au-delà de 12 Hz : scintillement. Un texte qui tremble : illisible, jamais.
- Rugosité trop forte en 9:16 : les traits brouillent les petits textes ; garder 1,15.
- Trop de traits à la fois : un geste, puis 0,3 s. Export : ni `mix-blend-mode`, ni filtre SVG.

## 10. Scènes toutes faites et classes

| Scène | Rôle | Durée | Textes (longueur maximale) |
|---|---|---|---|
| `titre` | Titre écrit, une seule ligne autour | 7 s | etiquette 22, titre 30, sous 46 |
| `liste` | 2 à 4 points, puce dessinée | 12 s | titre 30, point1 … point4 36 |
| `chiffre` | Un chiffre entouré et hachuré | 7 s | titre 30, unite 3, legende 46 ; `nombre 0→…` |
| `comparaison` | Deux croquis, l'un hachuré | 12 s | titre 30, gauche-titre et droite-titre 16, gauche-texte et droite-texte 48 |
| `etape` | Numéro entouré, puis l'action | 8 s | numero 2, titre 30, texte 64 |
| `alerte` | Une note encadrée à la main | 8 s | titre 30, texte 64 |
| `schema` | Trois idées reliées | 8 s | titre 30, a, b, c 16 |
| `moyeu` | Centre et parties | 10 s | titre 30, centre 18, parties 16 |
| `conclusion` | À retenir, une seule ligne, logo | 6 s | titre 30, sous 44 |

Point ou logo absent : retirer son élément et sa clé.
- Texte : `.titre`, `.titre-moyen`, `.texte`, `.etiquette`, `.note`, `.nombre`, `.compte`.
- Scènes : `.points`, `.croquis`, `.vignette`, `.numero`, `.cadre-alerte`, `.chaine`, `.idee`. Module : `une-ligne`.

Scène composée : ces classes et `<style>@scope { … }</style>`.

## 11. Espace de variation

- Claude décide pour chaque vidéo : ce que la ligne entoure, ce qui est hachuré, les notes de la marge.
- Structures : l'idée → trois croquis → ce qu'il faut retenir ; le carnet d'un atelier, page après page ; une démarche dessinée en étapes.
- Ouvertures : le titre qui s'écrit et qu'une ligne entoure ; un croquis qui se dessine ; une question dans la marge.
- Fins : une seule ligne autour de la leçon ; la page complète ; la note finale.
- Usages : raconter une idée ou une démarche ; résumer un atelier ; expliquer avec des croquis.
