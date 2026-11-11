# Vidéo explicative : flèches, annotations, graphiques, code, formules, caméra automatique et voix d'abord

Lire cette partie pour une scène qui relie des éléments par une flèche, met un mot en valeur au moment où la voix le dit, dessine à main levée, montre un graphique de données, du code ou une formule. La voix pose le rythme : un dessin se trace quand la voix le nomme (`data-start="mot:…"`, voir `pulse-motion reference audio/ancres`). « Ce qui se dit se montre » et « un changement toutes les 2 à 4 s » : `pulse-motion reference realisation`.

Tout passe par le **calque de dessin** du moteur : un SVG posé sur la scène, redessiné à chaque image à partir du temps seul, net à tout zoom de caméra. Il vise les éléments par leur `id` et les trouve dans le **relevé** des boîtes de la scène (à l'état final, sans la caméra). Les textes viennent toujours du déroulé.

## Flèche qui relie (#114)

```html
<div id="client" class="boite" data-texte="client" data-start="0.3"></div>
<div id="serveur" class="boite" data-texte="serveur" data-start="0.8"></div>
<i data-fleche="#client → #serveur" data-start="mot:serveur" data-dur="0.7"><span data-texte="requete"></span></i>
```

- La flèche part du centre de `#client`, vise le centre de `#serveur`, et s'arrête à 1,3 cqh du bord de chacun (rectangle, ou cercle pour un élément rond). Elle se trace en `data-dur` (0,7 s sans lui), sa pointe au bout du trait.
- L'étiquette est le `<span data-texte>` facultatif : un texte du déroulé, placé au-dessus d'une flèche droite (du côté extérieur d'une flèche courbe), qui apparaît pendant la seconde moitié du tracé. Le contrôle la juge comme tout texte.
- Réglages : `data-fleche-courbe` (-1 à 1, 0 : droite), `data-fleche-tete` (`fin`, `debut`, `deux`, `aucune`), `data-fleche-ecart` (distance au bord, en cqh), `data-fleche-pointille`, `data-fleche-suivre` (suit un élément qui se déplace ; sinon, places d'arrivée), `data-couleur` (couleur de la charte, `texte` par défaut), `data-epaisseur` (cqh, 0,4).
- Une extrémité peut être un point de l'image : `data-fleche="#a → 120,50"` (x, y en cqh).
- Un id absent de la scène : règle `fleche-cible-introuvable`, avec les ids proches.

## Annotations au mot (#115 à #121)

```html
<p><span id="prix" data-texte="prix" data-start="0.5"></span></p>
<i data-annoter="entoure" data-cible="#prix" data-start="mot:cher"></i>
```

| `data-annoter` | Ce qui se trace | Durée |
|---|---|---|
| `souligne` | un trait légèrement courbe sous l'élément | 0,6 s |
| `entoure` | une ellipse autour (1,12 × la largeur, 1,25 × la hauteur, marge comprise) | 0,8 s |
| `encadre` | un cadre | 0,6 s |
| `surligne` | un aplat sous le texte, de gauche à droite (opacité 0,38, 0,3 sur fond sombre) | 0,6 s |
| `barre` | un trait qui barre | 0,6 s |
| `croix` | deux traits en croix, l'un après l'autre | 0,6 s |
| `accolade` | une accolade à gauche de l'élément | 0,6 s |

Marge de 1,3 cqh autour de la boîte ; couleur `accent` par défaut (`data-couleur`), `data-epaisseur` en cqh. L'annotation et sa cible se superposent exprès : le contrôle ne le signale pas. `surligne` passe sous le texte, sans mode de fusion : le texte reste lisible. Viser un `<span>` autour du mot (sa boîte suit le mot), pas le paragraphe entier.

## Tracé à main levée (#112, #113)

- Sur la scène (style, ou `<style>@scope { :scope { … } }</style>` dans la scène) : `--pm-trait: main` dessine flèches, annotations et dessins libres à main levée ; `--pm-rugosite` (0 à 3, 1), `--pm-courbure` (1), `--pm-ebullition` (re-tracés par seconde ; 0 : figé). Même graine, même tracé.
- Sur une forme SVG d'une scène (`line`, `polyline`, `polygon`, `rect`, `ellipse`, `circle`, `path`) : `data-main-levee` la redessine à main levée au démarrage, sans changer sa boîte. Le minutage se pose sur son `<svg>` (ou un `<path>`).

## Dessin libre (`M.dessin`)

Rare : les composants ci-dessus suffisent presque toujours. Pour un dessin qu'aucun attribut ne fait :

```html
<script>
M.dessin('schema', function (d) {
  var a = d.boite('#client');
  d.fleche('#client', '#serveur', { debut: 'mot:envoie', etiquette: 'requete', courbe: 0.3 });
  d.annoter('#prix', { type: 'entoure', debut: 'mot:cher' });
  d.trait([[a.x, a.y + 8], [a.x + 40, a.y + 8]], { debut: 2, duree: 0.6, couleur: 'accent' });
  d.icone('truck', { x: 120, y: 30, taille: 10, debut: 3 });
  d.etiquette('legende', { x: 90, y: 85, debut: 3.5 });
});
</script>
```

- Temps (secondes de la scène) : `d.t`, `d.duree`, `d.temps('mot:froid')` (mêmes règles que `data-start`), `d.p(debut, duree, courbe)`, `d.depuis(v)`, `d.entre(a, b)`.
- Hasard stable : `d.hasard(i)`, `d.bruit(x)`, `d.ondule(ampleur, vitesse)`. Jamais `Math.random` pour placer un tracé.
- Géométrie en cqh : `d.L` (largeur de l'image), `d.H` (100), `d.centre`, `d.zone` (hors marges et sous-titres), `d.boite('#id')` → `{ x, y, l, h }` (centre et taille).
- Primitives : `d.trait(points, o)`, `d.chemin('M…', o)`, `d.rect({ x, y, l, h })`, `d.ellipse({ x, y, rx, ry })`, `d.fleche(de, vers, o)`, `d.annoter(cible, { type })`, `d.icone(nom, o)` (icône Lucide : `pulse-motion reference icones`), `d.etiquette(cle, { x, y })` (texte du déroulé), `d.groupe({ x, y, echelle, rotation }, fn)`, `d.couleur('accent')`.
- Options : `id`, `debut`, `duree`, `fin`, `entree` (`trace`, `fondu`, `pop`, `aucune`), `sortie` (`fondu`, `aucune`), `couleur`, `epaisseur`, `main`, `pointille`, `remplir`, `calque` (`dessous` : sous le texte).
- Une erreur dans le dessin : règle `dessin-erreur` ; la scène s'affiche sans lui.
- Graphiques sans textes : `d.barres([12, 19, 27], { x, y, l, h, debut, max })`, `d.courbe([…], o)`, `d.secteurs([…], { anneau: true })` ; pour des étiquettes, prendre le composant `data-graphique` ci-dessous.

## Graphiques de données (#122 à #124)

Les données vont dans le **déroulé**, comme les textes : `scenes[].graphiques.<clé>` (la consigne de l'animateur donne la clé ; `retoucher` écrit le déroulé). La scène pose une figure qui a la place du graphique :

```json
"graphiques": { "ventes": { "type": "barres", "unite": "%", "source": "Insee, 2025",
  "valeurs": [{ "etiquette": "2023", "valeur": 12, "debut": "mot:2023" }, { "etiquette": "2024", "valeur": 19, "debut": "mot:2024" }, { "etiquette": "2025", "valeur": 27, "accent": true }] } }
```

```html
<figure data-graphique="ventes" data-start="mot:ventes" style="width: 90cqh; height: 50cqh"></figure>
```

| La donnée parle de… | Graphique (`type`) |
|---|---|
| une évolution dans le temps | `courbe` |
| quantités à comparer, avant / après (deux barres) | `barres` |
| un classement, des libellés longs | `barres-horizontales`, triées dans les données |
| les parts d'un tout, 5 au plus | `anneau` (`secteurs` : disque plein) |
| un seul chiffre clé | pas de graphique : le compteur #021 |

- Axe tracé en 0,5 s ; chaque barre pousse en 0,9 s (la première 0,3 s après l'axe, puis toutes les 0,22 s, ou à son `debut`), sa valeur compte avec elle ; la courbe se trace en 1,6 s (ou passe par chaque point à son `debut`), son aire apparaît en dégradé ; l'anneau se remplit en 1,2 s, chaque étiquette (« Images 55 % ») arrive avec sa part.
- Nombres à la française (« 1 250,5 », « 12 % ») : écrire `1250.5`, jamais « 1 250 » ni l'unité dans `valeur`. `unite`, `prefixe`, `max` (haut de l'échelle), `decimales`, `accent` (valeur à la couleur d'accent), `null` (valeur inconnue : contour pointillé).
- Les barres partent toujours de zéro ; la source s'affiche sous le graphique. Vérité des chiffres (source, « à date », exemple) : `pulse-motion reference realisation`.
- Étiquettes, valeurs et source sont des textes jugés par le contrôle. Données fausses (valeur non numérique, liste vide, plus de 12 barres ou de 6 secteurs) : règle `graphique-donnees-invalides`.

## Code qui se transforme (#125)

```json
"code": { "formule": { "langage": "tableur", "titre": "Ventes.xlsx",
  "etapes": [{ "code": "=SOMME(B2:B13)" }, { "code": "=MOYENNE(B2:B13)", "debut": "mot:moyenne", "surligner": [1] }] } }
```

```html
<figure data-code="formule" data-start="mot:formule"></figure>
```

- Une fenêtre aux couleurs de la charte (barre de titre, police à chasse fixe embarquée seulement si la vidéo a du code). Langages : `tableur` (fonctions, plages `B2:B13`, `$A$1`, textes, nombres à virgule, `;`), `js`, `python`, `html`, `css`, `sql`, `json`, `sh`, `texte`.
- D'une étape à l'autre en 0,8 s : les morceaux communs glissent, les retirés s'effacent, les nouveaux apparaissent ; chaque étape après la première a son `debut`. `surligner` : numéros des lignes mises en valeur.
- Première apparition par lignes (0,12 s par ligne) ; `data-code-entree="frappe"` : tapé comme la saisie d'un écran. Taille : `--pm-code-taille` (3,6 cqh) ; une ligne plus large que la fenêtre : `code-trop-large`.

## Formules

```json
"formules": { "aire": "\\pi r^2", "interets": "C_n = C_0 \\times (1 + t)^n" }
```

```html
<p class="texte"><span data-texte="legende" data-start="0.6"></span> <span data-formule="aire" data-start="1.2"></span></p>
```

- Écrite en TeX simple, affichée en formule mathématique (police embarquée seulement si la vidéo en a une). Permis : lettres, chiffres (`3,5`), `+ - * / = < >`, `\frac{a}{b}`, `^`, `_`, `\sqrt{x}`, `\sqrt[3]{x}`, `\sum`, `\prod`, `\int`, `\lim`, `\to`, `\infty`, lettres grecques (`\pi`, `\alpha`…), `\cdot`, `\times`, `\div`, `\pm`, `\neq`, `\leq`, `\geq`, `\approx`, `\left( … \right)`, `\text{par an}`, `\%`, `\overline{x}`, `\vec{u}`, `\sin`, `\ln`. Autre chose : `formule-non-prise-en-charge`, qui propose une forme permise.
- Entrée par une classe du dictionnaire (`pm-m-pop`, fondu, masque) ; pas de tracé à la main sur une formule. Une formule de tableur se montre en code (`"langage": "tableur"`).

## Cinq squelettes

Composer l'image finale entière (tout ce qui sera montré, à sa place), puis la faire apparaître au fil de la voix.

| Squelette | Scène toute faite | Paysage | Portrait (9:16) |
|---|---|---|---|
| grand nombre | `chiffre` | le nombre au centre, sa légende dessous | pareil, plus petit |
| comparaison | `comparaison` | deux colonnes | deux blocs empilés |
| étapes | `etape`, `liste` | une étape, ou 2 à 4 points | empilés |
| moyeu | `moyeu` | un centre, 3 à 5 parties en couronne, une flèche vers chacune | les parties en rangée sous le centre |
| schéma | `schema` | trois boîtes reliées par `data-fleche` | les boîtes empilées, flèches verticales |

`moyeu` : clés `titre`, `centre`, `partie1` à `partie5` (4 et 5 facultatives : retirer la partie et sa flèche). En portrait, des parties courtes (12 caractères avec 3 parties, 6 avec 5). Une flèche se courbe par le style : `--pm-fleche-courbe` sur l'élément `data-fleche`, quand il n'a pas `data-fleche-courbe`.

## Encre des styles

Un style qui peint son encre dans son propre canevas (fusions permises) pose `data-encre="style"` sur la scène et s'inscrit par `M.dessin.encreStyle(fn)` : le calque garde ses nœuds, ses boîtes et ses étiquettes sans peindre l'encre, et `fn(idScene, traces)` reçoit à chaque image les tracés (`M.dessin.traces(idScene)` : chemin à main levée, transformation d'une pointe de flèche, part tracée de 0 à 1, épaisseur, couleur résolue, calque). Sans canevas inscrit, l'encre reste dans le SVG, opaque à 0,94, sans fusion.

## Caméra automatique (#126 à #128)

`<div data-camera="auto">` autour de tout le contenu de la scène (le conteneur remplit la scène : `camera-auto-cadre` sinon) : la caméra trouve seule ses plans dans le relevé, sans réglage. Plan d'ouverture sur l'image, rapprochement d'au moins 1,3 fois quand on a le temps de regarder (tenu au moins 1,5 s, pas plus d'un changement de zoom en 5 s), recul final sur l'image entière, dérive lente de 3,5 %, zoom de 2,2 au plus, jamais un texte, une carte ou une étiquette coupé pendant un plan tenu, hors bande des sous-titres et zones des réseaux. Une scène qui reprend l'image de la précédente (mêmes éléments aux mêmes places, transition autre que `coupe`) part de son dernier plan. Au déroulé : `"camera": "auto"` (toute la vidéo) ou `scenes[].camera` (`auto` | `fixe`) ; une scène demandée en `auto` sans le conteneur : `camera-auto-absente`.

- D'autres clauses s'ajoutent : `data-camera="auto; secousse 1 3+0.2; saturation 1→0.6 0+4"` ; jamais `zoom`, `x` ou `y` avec `auto` (`camera-auto-melangee`). Sans `auto`, la caméra manuelle reste.
- Gros plan demandé (#127) : `<i data-cadrer="#prix" data-start="mot:cher" data-dur="3"></i>` ; il ne dessine rien. Une ligne de code surlignée est aussi un gros plan possible.
- Composer pour elle : l'image finale entière, un élément près de celui qu'il suit, une boîte avec son étiquette, une étiquette pour chaque icône à cadrer (une icône seule n'a pas de gros plan), pas de caméra automatique sur une scène où un élément traverse l'image.
- Le plan de chaque scène est écrit dans `sortie/controle.json` (`cameras` : départ, mouvements).

## Narration

- Une idée par scène ; des phrases de 8 à 18 mots ; environ 2,5 mots par seconde avec la voix de synthèse (3,5 au plus : `pulse-motion reference rythme`) ; chaque phrase déclenche une image (un dessin, une flèche, une barre).
- Finir par une phrase de synthèse qui reprend l'idée entière ; ni « tout simplement », ni slogan.
- Structure du modèle de vidéo `explication` : accroche, problème, mécanisme en trois étapes, chiffre, synthèse (`pulse-motion modeles afficher explication`) ; caméra et bruitages automatiques y sont allumés d'office.

## Voix d'abord : repères, forme dite, allure

Le texte dit (`voix.texte`) peut porter trois marques, jamais montrées dans les sous-titres :

- `[#serveur]` : repère à l'instant du mot qui suit ; un élément y entre par `data-start="repere:serveur"` (+0.2 permis). Noms uniques ; inconnu : `repere-introuvable`.
- `{HACCP|hache a cé cé pé}` : affiché HACCP, dit comme écrit à droite ; `mot:HACCP` et `mot:hache` le trouvent tous deux. La prononciation du glossaire s'applique d'elle-même à la voix provisoire.
- `[pause 0.6]` : silence de la voix de synthèse ; ignoré pour une prise enregistrée.

Voix de synthèse locale (facultative, installée avec l'accord de la personne) : `pulse-motion voix synthese .` ; une voix française, féminine, moins naturelle qu'une vraie voix ; elle s'exporte sans accord et se crédite d'office. Détail : `pulse-motion reference audio/voix`.

Les temps des mots d'une scène, en une ligne : `pulse-motion voix mots . --scene <id>`.

`allure` du déroulé (0,7 à 1,6, 1 par défaut) : temps internes des scènes × allure, début et fin de voix et transitions ÷ allure, musique générée à un tempo × √allure ; les ancres `mot:` et `repere:` restent sur la voix, une prise n'est jamais accélérée. Une scène plus calme : `--pm-ampleur-scene: 0.6` sur la `<section>` (ampleur de ses mouvements `pm-m-*` et de ses secousses) et `rythme` 0,85.

## Bruitages automatiques

`"bruitages": { "auto": true }` : un son doux à chaque entrée, selon son genre (carte, image : `pop` ; flèche, trait, annotation : `souffle`, `crissement` à main levée ; point de liste : `blip` qui monte dans la gamme de la musique ; compteur, graphique : `tic` en série), éclaircis (deux mêmes sons à moins de 0,12 s n'en font qu'un, 3 au plus par demi-seconde). Titres et textes : aucun. Un `data-son` posé à la main passe toujours ; `"minimal"` : transitions et sons posés à la main seulement. La table d'un style (`identite.json`, `son.bruitages`) remplace ces sons. `"musique": { …, "accents": true }` : une note douce au début de chaque scène.

## Ce qui casse

- `Math.random` dans `M.dessin` : il change à chaque image ; prendre `d.hasard(i)`.
- Un texte écrit dans le HTML ou dans le script : toute étiquette est une clé du déroulé (`data-texte`, `d.etiquette('cle')`).
- Une cible appelée avant d'exister, ou un id mal écrit : `fleche-cible-introuvable`.
- Un mot de repère dit deux fois : la première fois compte (`mot:froid#2` pour la seconde).
- Une flèche vers un élément qui traverse l'image sans `data-fleche-suivre` : elle vise sa place d'arrivée.
- Une annotation sur un bloc entier : elle prend toute sa largeur ; viser le `<span>` du mot.
- Un chiffre, un code ou une formule écrit dans la figure : tout vient du déroulé (`graphiques`, `code`, `formules`) ; une clé absente : `donnees-manquantes`.
- « 19 % » dans `valeur` : écrire `19` et `"unite": "%"`.
- L'allure appliquée à la main dans les durées : le moteur divise déjà toutes les durées par l'allure.
- Une caméra automatique sur un conteneur qui ne couvre qu'une partie de la scène : `camera-auto-cadre` ; `zoom`, `x` ou `y` avec `auto` : `camera-auto-melangee`.
- Un repère posé deux fois, ou un crochet non fermé dans le texte dit : erreur du déroulé.

## Retouches en une phrase

| La personne dit | Faire |
|---|---|
| « ajoute une flèche de Client à Serveur quand je dis envoie » | `<i data-fleche="#client → #serveur" data-start="mot:envoie">` (donner les `id` s'il le faut) |
| « mets "requête" sur la flèche » | clé du déroulé et `<span data-texte="…">` dans la flèche |
| « entoure le prix quand je dis cher » | `<i data-annoter="entoure" data-cible="#prix" data-start="mot:cher">` |
| « souligne, surligne, barre, encadre ce mot » | le type d'annotation qui convient |
| « plus dessiné », « comme au tableau » | `--pm-trait: main` sur la scène ; « qui frémit » : `--pm-ebullition: 8` |
| « la flèche plus courbe », « dans les deux sens » | `data-fleche-courbe="0.4"`, `data-fleche-tete="deux"` |
| « fais un graphique avec ces chiffres » | `scenes[].graphiques.<clé>` (type d'après la table), `<figure data-graphique="<clé>">` |
| « la barre 2024 quand je dis 2024 » | `"debut": "mot:2024"` sur sa valeur |
| « mets 2025 en avant » | `"accent": true` sur sa valeur |
| « montre la formule, puis passe à la moyenne quand je dis moyenne » | `scenes[].code.<clé>`, une étape par version, `"debut": "mot:moyenne"` |
| « écris la formule de l'aire du disque » | `scenes[].formules.aire = "\\pi r^2"`, `<span data-formule="aire">` |
| « laisse la caméra bouger toute seule » | `<div data-camera="auto">` autour du contenu (ou `"camera": "auto"` au déroulé, puis la scène) |
| « garde la caméra fixe scène 2 » | `scenes[].camera` : `fixe`, retirer `auto` de la scène |
| « gros plan sur le prix quand je dis cher » | `<i data-cadrer="#prix" data-start="mot:cher" data-dur="3"></i>` |
| « la flèche quand je dis serveur, même si la phrase change » | `[#serveur]` dans le texte dit, `data-start="repere:serveur"` |
| « mets une voix de synthèse », « fais-la parler plus lentement » | `/pulse-motion:voix` (section « Synthèse ») |
| « plus rythmé pour les réseaux », « plus posé » | `"allure": 1.2`, `"allure": 0.85` au déroulé |
| « il prononce mal HACCP » | `{HACCP|hache a cé cé pé}` dans le texte dit, ou la prononciation au glossaire (« notée pour vos prochaines vidéos ») |
| « plus rythmé pour les réseaux », « plus posé » | `allure` 1,2 ou 0,85 (`pulse-motion reference remarques`) |
| « la scène 3 plus calme » | `--pm-ampleur-scene: 0.6` sur sa section, `rythme` 0,85 |
| « ajoute des petits sons », « moins de bruitages » | `bruitages.auto` : `true`, ou `"minimal"` |
