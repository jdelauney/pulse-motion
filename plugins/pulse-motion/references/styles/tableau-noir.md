# Style « tableau-noir »

> Un tableau d'école propre, vert profond et mat : la craie s'écrit dans l'ordre, avec pression ; peu de mots, grandes lettres, trois craies au plus.
> Sources : lemo-opuscar, `chalkboard` (MIT, © 2026 LemoLab) ; explainroo, `chalk` (MIT) ; adaptés.

## L'essentiel

- Partir d'une des **9 scènes toutes faites** (`pulse-motion scene tableau-noir <type>`) ; le `type` noté au déroulé permet de changer de style sans réécrire la scène.
- Décor (`.marbrure`, `.fenetre`, `data-decor`) : `data-dur="scene"`. Sur la **dernière scène**, il s'arrête 1 s avant la fin : image stable d'au moins 0,5 s.
- Formats 16:9, 1:1, 4:5 et 9:16. Ton sombre seulement.
- Chaque texte s'écrit : `data-lettres="ecrit"` et un `data-dur`. Longueurs maximales du § 10.

## 1. Essence, et ce qu'il n'est pas

- Ardoise verte, mate, au grain fin ; la craie mord le grain ; un peu de poussière au lever du trait ; une lumière de fenêtre qui glisse ; un rebord de bois.
- Trois craies : blanche (structure), d'accent (ce que la leçon suit), pâle (une seconde main).
- Pas `tableau-blanc` : ni brillant, ni feutres, ni aimants, ni marques fantômes. Caméra de face.

## 2. Matières et rendu

- Encre : `data-fleche` et `data-annoter`, redessinés dans le canevas du style (module `encre`, `--pm-encre: craie`) : le grain du tableau décide où la craie prend, 2 à 5 grains de poussière au lever du trait. Repli : encre du calque, opaque à 0,94.
- Décor vivant, jamais immobile 2,5 s : `.marbrure` qui dérive, `.fenetre` qui traverse, `.rebord`. `.voile` : le passage de l'éponge.

## 3. Logique de couleur

- Vert ardoise fixe ; craie blanche (`--c-texte`) ; `--c-accent` de la charte en craie d'accent (`.compte`) ; `--c-primaire` en craie pâle (`.seconde-main`, étiquettes, tirets).
- La craie d'accent reste rare : une chose par scène. Palette d'exemple (celle du style) : ardoise `#233a30`, craie `#f1efe6`, jaune `#f2d16b`, bleu pâle `#a9c7d8`.

## 4. Typographie et sous-titres

- **Kalam** 400 (écriture à la craie) : titres (9,6 cqh, moyen 6,2, interligne 1,28), chiffres (22 cqh) ; **Nunito Sans** 400 : texte (4 cqh), 700 : étiquettes.
- Sous-titres sur l'ardoise assombrie (`--pm-st-fond`). Lisibilité : `controles.md`.

## 5. Qualité du mouvement

- La craie écrit avec pression : une étiquette en 0,8 s, un titre en 2 s ; puis le trait souligne ou entoure (#115, #116).
- Rien ne vole, rien ne rebondit ; le décor bouge toujours, très lentement.
- Conseillés : #011, #114, #117. Déconseillés : #001, #028, #036, #062.

## 6. Grammaire de caméra et transitions

| Mouvement | Ce qu'il exprime | Peut servir |
|---|---|---|
| Plan fixe de face | lire le tableau | presque toutes les scènes |
| Zoom sur un détail (#037) | regarder la craie de près | un chiffre, un mot entouré |
| Glissement du panneau | passer au tableau suivant | une nouvelle partie |

- Toujours de face, jamais incliné. Le décor vit pendant les plans fixes.
- Transitions : `glissement` (le panneau qui coulisse), `fondu`. À éviter : `whip`, `zoom`, `retournement`.
- Shaders conseillés, jamais imposés : `grain` très léger.

## 7. Palette sonore

- Ambiance `calme` par défaut, `acoustique` en alternative.
- Bruitages : écriture et tracé → `craie` (un son tenu) ; chiffre → `tic`, comme une horloge murale qui habite un silence.
- Matière : `craie`. Moment fort : `carillon`. Toute craie qui touche le tableau a son son ; 1 à 3 sons par scène.

## 8. Gestes natifs

- **Écrire à la craie.** *Recette :* `data-lettres="ecrit"`, puis `data-annoter="souligne"` (#115). *Convient à :* un titre ; une règle ; une formule.
- **La craie d'accent.** *Recette :* `.compte`, `data-couleur="accent-lisible"`, `data-annoter="entoure"` (#116). *Convient à :* le résultat ; la notion suivie ; une exception.
- **Effacer, réécrire.** *Recette :* `.voile` (`--p`), puis le bon texte au même endroit. *Convient à :* une idée reçue ; une erreur fréquente ; une correction.
- **La seconde main.** *Recette :* `.seconde-main`. *Convient à :* une remarque ; une question d'élève ; un rappel.

## 9. Pièges

- Craie d'accent partout : elle ne dit plus rien. Un seul effacement par vidéo suffit.
- Cadre fixe immobile plus de 2,5 s : garder `.marbrure` et `.fenetre` à la durée de la scène.
- Trop de mots : de grandes lettres, des phrases courtes. Export : ni `mix-blend-mode`, ni filtre SVG.

## 10. Scènes toutes faites et classes

| Scène | Rôle | Durée | Textes (longueur maximale) |
|---|---|---|---|
| `titre` | Titre écrit et souligné | 7 s | etiquette 22, titre 30, sous 46 |
| `liste` | 2 à 4 points, un tiret devant chacun | 12 s | titre 30, point1 … point4 36 |
| `chiffre` | Un chiffre écrit et entouré | 7 s | titre 30, unite 3, legende 46 ; `nombre 0→…` |
| `comparaison` | Deux panneaux, l'un à l'accent | 12 s | titre 30, gauche-titre et droite-titre 16, gauche-texte et droite-texte 48 |
| `etape` | Numéro entouré, puis l'action | 8 s | numero 2, titre 30, texte 64 |
| `alerte` | Coup d'éponge, puis l'encadré | 8 s | titre 30, texte 64 |
| `schema` | Trois idées reliées | 8 s | titre 30, a, b, c 16 |
| `moyeu` | Centre et parties | 10 s | titre 30, centre 18, parties 16 |
| `conclusion` | À retenir, souligné, logo | 6 s | titre 30, sous 44 |

Point ou logo absent : retirer son élément et sa clé.
- Texte : `.titre`, `.titre-moyen`, `.texte`, `.etiquette`, `.nombre`, `.compte`, `.seconde-main`.
- Scènes : `.points`, `.panneaux`, `.panneau`, `.numero`, `.cadre-alerte`, `.chaine`, `.idee`. Module : `encre`.

Scène composée : ces classes et `<style>@scope { … }</style>`.

## 11. Espace de variation

- Claude décide pour chaque vidéo : ce qui s'écrit à la craie d'accent, l'unique effacement, la seconde main.
- Structures : la question au tableau → la méthode → la réponse ; l'idée reçue effacée → la bonne idée ; trois panneaux d'une même leçon.
- Ouvertures : le titre qui s'écrit ; une question posée au tableau ; un chiffre entouré.
- Fins : la réponse soulignée ; le tableau complet ; la règle à retenir.
- Usages : faire un cours ; réviser une notion ; raconter une méthode pas à pas.
