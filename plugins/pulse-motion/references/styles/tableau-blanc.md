# Style « tableau-blanc »

> Un seul tableau blanc brillant où chaque idée a sa région : du vrai feutre, écrit dans l'ordre, pas du texte animé ; pas de main, un feutre flotte avec son ombre puis se gare.
> Sources : lemo-opuscar, `whiteboard` (MIT, © 2026 LemoLab) ; adapté.

## L'essentiel

- Partir d'une des **9 scènes toutes faites** (`pulse-motion scene tableau-blanc <type>`) ; le `type` noté au déroulé permet de changer de style sans réécrire la scène.
- Décor (`.reflet`, `data-decor`) : `data-dur="scene"`. Sur la **dernière scène**, il s'arrête 1 s avant la fin : image stable d'au moins 0,5 s.
- Formats 16:9, 1:1, 4:5 et 9:16. Ton clair seulement.
- Chaque texte s'écrit : `data-lettres="ecrit"` et un `data-dur` (fini à son échéance). Longueurs maximales du § 10.

## 1. Essence, et ce qu'il n'est pas

- Surface blanc chaud et brillante, reflet qui glisse, marques fantômes de l'ancienne leçon ; le texte s'écrit lettre après lettre ; l'encre fonce là où deux traits se croisent ; des aimants tiennent les points.
- Pas `plan-technique` : trait à la main, pas à la règle. Pas `carnet` : feutre sur tableau brillant, pas sur papier. Pas de la typographie animée : rien ne rebondit, rien ne vole.

## 2. Matières et rendu

- Encre : `data-fleche` et `data-annoter`, redessinés dans le canevas du style (module `encre`) à 0,94 en multiply ; repli : encre du calque, opaque à 0,94. Trait à la main, sans frémissement.
- `.reflet` (qui glisse ; `data-profondeur="0.35"` sous une caméra), `.fantomes` (6 %), `.feutre`, `.aimant`.

## 3. Logique de couleur

- Trois feutres au plus, chacun un sens tenu toute la vidéo : encre sombre (texte, structure), `--c-primaire` de la charte (signal, mesure, processus), `--c-accent` (ce qui compte, un par région ; aimants).
- Le fond reste le tableau ; jamais d'aplat de couleur. Palette d'exemple (celle du style) : encre `#1f2328`, bleu `#1d5fbf`, rouge `#c62f22`.

## 4. Typographie et sous-titres

- **Kalam** 700 (écriture au feutre) : titres (10 cqh, moyen 6,4, interligne 1,28), chiffres (22 cqh) ; 400 : texte (4 cqh).
- Sous-titres sur étiquette blanc cassé (`--pm-st-fond`), 44 caractères par ligne. Lisibilité : `controles.md`.

## 5. Qualité du mouvement

- Une étiquette s'écrit en 0,5 à 0,8 s, un titre en 2 s environ ; puis le trait souligne ou entoure.
- Le feutre entre, plane, se gare hors champ ; l'aimant tombe, son ombre rétrécit (#007).
- Conseillés : #011, #115, #116, #117, #114. Déconseillés : #001, #028, #036.

## 6. Grammaire de caméra et transitions

| Mouvement | Ce qu'il exprime | Peut servir |
|---|---|---|
| Recul (#056 à rebours, #128) | voir tout le tableau | un schéma fini, une vue d'ensemble |
| Filé vers une région (#042) | passer à l'idée voisine | une étape, un exemple |
| Zoom sur un détail (#037) | suivre le trait | un chiffre, un mot entouré |
| Plan fixe | lire le tableau | la plupart des scènes |

- Un `.tableau` plus grand que l'image sous `data-camera` : chaque idée a sa région, la caméra voyage. Jamais de coupe sur le tableau.
- Transitions : `glissement`, `whip`. À éviter : `coupe`, `zoom`, `retournement`.
- Shaders conseillés, jamais imposés : aucun.

## 7. Palette sonore

- Ambiance `calme` par défaut, `acoustique` ou `mecanique` en alternative.
- Bruitages : écriture et tracé → `feutre` (la matière, un son tenu) ; point et forme → `aimant` ; chiffre → `tic`.
- Matière : `feutre`. Moment fort : `carillon`. Le feutre qui écrit a toujours son son ; 1 à 3 sons par scène.

## 8. Gestes natifs

- **Écrire dans l'ordre.** *Recette :* `data-lettres="ecrit"` et `data-dur`, puis `data-annoter="souligne"` (#115). *Convient à :* un titre ; une définition ; un mot nouveau.
- **Les aimants.** *Recette :* `.points`, ou `.aimant` posé (#007). *Convient à :* une liste ; trois règles ; des choix.
- **Entourer ce qui compte.** *Recette :* `data-annoter="entoure"`, `data-couleur="accent-lisible"` (#116). *Convient à :* un chiffre ; une étape ; une réponse.
- **La vue d'ensemble.** *Recette :* `.tableau` et `data-camera="zoom 1.12→1 …"` (#128). *Convient à :* un schéma ; un bilan ; une carte d'idées.

## 9. Pièges

- L'accent partout : il ne dit plus rien ; un par région.
- Texte qui apparaît d'un coup : toujours `ecrit`, 0,04 à 0,1 s par lettre.
- Étiquette coupée par un zoom : 1,15 au plus, recul plutôt qu'avancée.
- Export : ni `mix-blend-mode`, ni filtre SVG.

## 10. Scènes toutes faites et classes

| Scène | Rôle | Durée | Textes (longueur maximale) |
|---|---|---|---|
| `titre` | Titre écrit et souligné | 7 s | etiquette 22, titre 30, sous 46 |
| `liste` | 2 à 4 points tenus par un aimant | 12 s | titre 30, point1 … point4 36 |
| `chiffre` | Un chiffre écrit et entouré | 7 s | titre 30, unite 3, legende 46 ; `nombre 0→…` |
| `comparaison` | Deux régions, l'une à l'accent | 12 s | titre 30, gauche-titre et droite-titre 16, gauche-texte et droite-texte 48 |
| `etape` | Numéro entouré, puis l'action | 8 s | numero 2, titre 30, texte 64 |
| `alerte` | Encadré à l'accent | 8 s | titre 30, texte 64 |
| `schema` | Trois idées reliées, recul | 8 s | titre 30, a, b, c 16 |
| `moyeu` | Centre et parties | 10 s | titre 30, centre 18, parties 16 |
| `conclusion` | À retenir, souligné, logo | 6 s | titre 30, sous 44 |

Point ou logo absent : retirer son élément et sa clé.
- Texte : `.titre`, `.titre-moyen`, `.texte`, `.etiquette`, `.nombre`, `.compte`. Tableau : `.tableau`, `.aimant`.
- Scènes : `.points`, `.regions`, `.region`, `.numero`, `.cadre-alerte`, `.chaine`, `.idee`. Module : `encre`.

Scène composée : ces classes et `<style>@scope { … }</style>`.

## 11. Espace de variation

- Claude décide pour chaque vidéo : les régions du tableau, ce qui est entouré, l'ordre d'écriture, le feutre de chaque sens.
- Structures : la notion → trois exemples → ce qu'il faut retenir ; le problème au tableau → la méthode → la réponse entourée ; une carte d'idées qui se remplit.
- Ouvertures : le titre qui s'écrit ; une question au tableau ; un schéma vu de près.
- Fins : la vue d'ensemble ; la réponse entourée ; le feutre qui se gare.
- Usages : expliquer une notion pas à pas ; former en salle ou à distance ; dessiner un processus au tableau.
