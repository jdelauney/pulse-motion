# Effets de particules

## L'essentiel

- Un effet = une balise vide dans la scène : `<div data-effet="etincelles"></div>`. Aucun JavaScript.
- Elle se minute comme le reste (`data-start`, `data-dur`) : `data-dur` est la **durée d'émission** ; les particules déjà nées finissent leur vie après.
- `data-ancre="#id"` : les particules naissent sur la boîte de cet élément (et la suivent s'il bouge). Sans ancre : la boîte de la balise elle-même, c'est-à-dire toute la scène.
- `data-calque="arriere"` : derrière le contenu (ambiance) ; `avant` (par défaut) : devant (mise en valeur).
- `data-reglages="nombre: 300; couleur: accent"` : seulement les réglages de la table ci-dessous. Couleurs : `#rrggbb` ou `primaire`, `accent`, `texte`, `fond` (charte).
- Pour une ambiance (neige, pluie, poussière, fumée), régler `data-dur` sur la durée de la scène (ou presque) : l'effet n'émet que pendant `data-dur`, 1 s par défaut. `nombre` est un total émis pendant `data-dur` pour les effets continus (neige, pluie, poussière, fumée, feu, paillettes, énergie, étincelles, braises) : une durée plus longue étale le même nombre plus finement ; d'un coup pour confettis, explosion et feu d'artifice ; `etincelles` de `feu` est un débit par seconde.
- `data-graine="7"` : un autre tirage du hasard (« fais-les partir autrement »), même recette.
- Les particules réagissent à la scène quand elle déclare des obstacles : `data-obstacle` sur un élément (sa boîte), `data-obstacle="forme"` (sa forme exacte, les lettres d'un titre). Neige et confettis s'y posent, la pluie y éclabousse, les étincelles y rebondissent (voir « Collisions avec la scène »).
- Un élément peut se **briser**, se **désintégrer**, être **assemblé** par des particules ou se **métamorphoser** en un autre : `data-ancre` sur l'élément (et `data-cible` pour l'élément d'arrivée) ; le moteur cache et montre l'élément réel au bon moment (voir « Fragmentation »).
- Des **cordes** et des **tissus** (drapeau, bannière faite d'un titre, rideau qui se déchire, guirlande, filet) s'attachent aux éléments de la scène et les suivent quand ils bougent (voir « Cordes et tissus »).
- Un effet **sert un propos** : mettre en valeur un chiffre, célébrer une conclusion, poser une ambiance. Jamais pour décorer.
- Après écriture : `pulse-motion assembler .` puis `pulse-motion controler .` ; les erreurs `effet-…`, `reglage-invalide`, `ancre-introuvable` se corrigent dans la scène.
- Fonds animés, auras, transitions et post-traitements par shader, modules qui changent le comportement des particules : `pulse-motion reference shaders`.

## Poser un effet

```html
<h2 id="chiffre" class="grand-chiffre" data-texte="chiffre" data-start="0.3"></h2>
<div data-effet="etincelles" data-ancre="#chiffre" data-start="#chiffre:fin" data-dur="1.5"
     data-reglages="nombre: 300; couleur: accent"></div>
```

| Attribut | Valeurs |
|---|---|
| `data-effet` | nom d'un effet de la table, ou d'une recette du projet (`effets/<nom>.json`) |
| `data-ancre` | `#id` d'un élément de la même scène |
| `data-cible` | `#id` de l'élément d'arrivée d'une `metamorphose` (même scène) |
| `data-calque` | `avant` (défaut) ou `arriere` |
| `data-reglages` | `nom: valeur` séparés par `;` |
| `data-graine` | entier |
| `data-start`, `data-dur` | comme tout élément minuté ; `data-dur` = durée d'émission (1 s par défaut) |

Pour une zone précise sans élément à viser, donner une classe à la balise (`<div class="zone-feu" data-effet="feu">`) et une position et une taille dans le `@scope` de la scène : `.zone-feu { inset: 70% auto auto 30%; width: 40%; height: 10%; }`.

## Bibliothèque

| Effet | Réglages | Quand l'utiliser |
|---|---|---|
| `etincelles` | `nombre`, `vitesse`, `couleur`, `gravite`, `taille` | Mettre en valeur un chiffre ou un mot à son arrivée (ancre sur l'élément, 1 à 2 s). `couleur: bleu` n'existe pas : donner un `#rrggbb`, toute la gerbe prend cette teinte. |
| `braises` | `nombre`, `vitesse`, `couleur`, `gravite`, `taille` | Ambiance chaude et calme qui monte (calque arrière), sujets sur la chaleur, l'énergie, la passion. |
| `confettis` | `nombre`, `vitesse`, `couleur1`, `couleur2`, `couleur3` | Célébrer : conclusion, résultat obtenu, félicitations. Une seule fois par vidéo. |
| `feu-artifice` | `fusees`, `eclats`, `couleur`, `hauteur` | Grande célébration (lancement, fin de parcours) ; plutôt hors formation. |
| `fumee` | `nombre`, `couleur`, `opacite`, `vent`, `taille` | Ambiance, mystère, chaleur qui s'échappe ; calque arrière. |
| `feu` | `intensite`, `hauteur`, `couleur`, `etincelles` | Montrer une combustion, un danger, une urgence ; ancre sur une zone basse. |
| `poussiere` | `nombre`, `couleur`, `eclat`, `vitesse` | Fond vivant et discret qui évite les temps morts (calque arrière, toute la scène) ; sur un fond clair, `couleur: primaire` ou `#8fa6c4`. |
| `neige` | `nombre`, `vitesse`, `vent`, `taille`, `couleur` | Froid, hiver, calme ; toute la scène, calque arrière ; l'image est déjà garnie de flocons dès le début ; sur un fond clair, `couleur: primaire` ou `#8fa6c4`. |
| `pluie` | `nombre`, `vent`, `couleur`, `opacite` | Météo, humidité, ambiance triste ; toute la scène, calque arrière ; sur un fond clair, `couleur: primaire` ou `#8fa6c4`. |
| `paillettes` | `nombre`, `couleur`, `eclat`, `taille` | Révélation, nouveauté, « magie » d'une astuce ; ancre sur l'élément révélé. |
| `energie` | `nombre`, `couleur`, `rotation`, `eclat` | Puissance, technologie, idée qui s'allume ; ancre sur un pictogramme ou un mot. |
| `explosion` | `puissance`, `debris`, `couleur`, `fumee` | Transition choc, rupture, « boum » ; courte (salve unique). |

Voir une recette : `pulse-motion effet <nom>`.

Particules qui interagissent (nuée, banc, lucioles, eau, miel, sable, neige lourde) : voir « Interactions ».
Cordes et tissus (drapeau, bannière, rideau, guirlande, filet, corde) : voir « Cordes et tissus ».
Milieux fluides (air, brasier, eau-encre) et effets qui s'y couplent (braises-portees, fusee-panache) : voir « Milieux ».

## Dosage

- **Nombre** : c'est `/pulse-motion:creer` qui décide quelles scènes reçoivent un effet (au plus deux effets simultanés à l'écran ; en formation courte, un ou deux effets dans toute la vidéo) et le dit à l'animateur ; l'animateur n'en ajoute pas de lui-même. Un effet devant (`avant`) ne dure pas pendant la lecture d'un texte long (le contrôle `effet-sur-texte` le signale) ; préférer `arriere` pour une ambiance.
- **Fond clair** : la neige et la poussière, blanches par défaut, disparaissent sur un fond clair (style `clair-pedagogique`) : régler `couleur: primaire` ou un gris-bleu comme `#8fa6c4`.
- **Durées** : mise en valeur 1 à 2 s ; ambiance sur toute la scène ; célébration 2 à 3 s.
- **Quantité** : rester sous 300 000 particules par scène (contrôle `budget-particules`) ; les valeurs par défaut sont faites pour une image 16:9.
- **Couleurs** : laisser la charte (`primaire`, `accent`) pour les effets de mise en valeur ; une couleur de matière (feu, fumée, neige) reste réaliste.
- **Vidéo sobre** : un effet discret bien placé vaut mieux que trois effets spectaculaires.

## Retouches en une phrase

| Demande | Changement |
|---|---|
| « plus d'étincelles », « moins de confettis » | `nombre` dans `data-reglages` (× 2 ou ÷ 2), ou l'équivalent : `debris`, `eclats`, `etincelles` |
| « plus lent », « plus vif » | `vitesse` (0,6 ou 1,5) ou le réglage équivalent de l'effet (voir la table) |
| « en bleu », « aux couleurs de la marque » | `couleur: primaire` ou `#rrggbb` |
| « fais-les partir autrement » | `data-graine` (un autre entier) |
| « derrière le texte » | `data-calque="arriere"` |
| « plus tard », « plus longtemps » | `data-start`, `data-dur` |
| « enlève les confettis » | supprimer la balise |

## Créer un effet

Seulement si aucun effet de la table ne convient, dans le projet : `effets/<nom>.json`. **De préférence par héritage**, sous un **nouveau nom** : un fichier `etincelles.json` avec `etend: "etincelles"` serait un héritage circulaire, et sans `etend` il remplacerait la recette de la bibliothèque pour toute la vidéo :

```json
{
  "version": 1,
  "nom": "etincelles-bleues",
  "etend": "etincelles",
  "description": "Étincelles froides et plus lentes, pour un sujet sur le froid",
  "parametres": { "couleur": { "defaut": "#9fd3ff" }, "vitesse": { "defaut": 0.6 } },
  "emetteurs": [{ "nom": "gerbe", "forces": [{ "type": "gravite", "valeur": "30 * gravite" }, { "type": "trainee", "coef": 1.5 }] }]
}
```

`etend` fusionne les objets, remplace les tableaux et fusionne les émetteurs par `nom`. Une recette complète :

| Partie | Contenu |
|---|---|
| `parametres` | réglages exposés : `{ "defaut", "min", "max" }` (nombre) ou `{ "defaut", "type": "couleur" }` ; seuls eux se règlent dans la scène |
| `rendu_calque` | `bloom` (valeurs usuelles 0 à 4 ; 3 pour un éclat franc ; le moteur le normalise), `seuil_bloom` (1), `tons` (`douce`, `aces` pour un rendu cinéma, `neutre` pour les couleurs exactes d'un élément fragmenté) |
| `emetteurs[].naissance` | `debit` (par seconde) ou `salves` (`[{ "t", "nombre" }]`, 8 au plus), ou `nombre` pour un sous-émetteur ; `forme` (`point`, `cercle`, `anneau`, `rectangle`, `ligne`, `ancre` ; `zone`: `surface` ou `contour`) ; `vitesse` (`direction`, `cone` en degrés, `valeur`, `radiale`, `heritage`) ; `vie`, `taille`, `masse`, `z`, `rotation`, `vitesse_angulaire` |
| `emetteurs[].forces` | `gravite`, `trainee` (`quadratique`), `vent`, `turbulence`, `attracteur` (force négative : répulseur), `vortex`, `rappel` ; 8 au plus |
| `emetteurs[].vie` | au cours de la vie : `couleur` (`degrade` + `courbe`), `taille`, `intensite` (> 1 : brille), `opacite` (`{ "de", "a", "courbe" }`) |
| `emetteurs[].rendu` | `type` (`sprite`, `etincelle`, `trainee`, `planche`), `texture` (`disque-doux`, `etoile`, `fumee`, `flamme`, `eclat`, `confetti`, ou `assets/…`), `melange` (`additif` : lumière ; `alpha` : matière ; `premultiplie` : émission qui ne voile l'image qu'à hauteur de son alpha, comme un feu lumineux qui voile un peu), `flou` |
| `emetteurs[].a_la_mort` | `{ "emetteur": "<nom>" }` : sous-émetteur lancé à la mort (2 niveaux au plus) |
| `emetteurs[].modules` | modules WGSL : `{ "force": "spirale", "couleur": "couleur-vitesse", "forme": "etoile" }` (shaders de la bibliothèque ou de `shaders/` du projet) ; voir `pulse-motion reference shaders` |

Valeurs : un nombre, un intervalle `[min, max]` tiré au hasard, ou une expression avec les réglages (`"30 * vitesse"`, `"nombre / dur"` ; `dur` = durée d'émission). Longueurs en cqh (1 % de la hauteur de l'image), temps en secondes, angles en degrés. Courbes : celles du moteur (`quad-out`, `sine-arch` pour monter puis redescendre, `wave` pour scintiller).

Ne pas recopier d'effets, de textures ni de shaders trouvés en ligne : leurs licences ne le permettent souvent pas ; écrire une recette originale.

## Collisions avec la scène

Les particules rebondissent sur un cadre, se posent sur un titre, s'accumulent au sol, meurent au contact. La **scène** dit ce qui fait obstacle ; la **recette** dit comment ses particules réagissent. Les collisions ne s'activent que si la scène (ou une scène voisine, ou le déroulé) déclare au moins un obstacle, ou si la recette décale le sol : sans obstacle, un effet se comporte comme avant.

### Déclarer les obstacles d'une scène

```html
<h1 id="titre" data-texte="titre" data-obstacle="forme"></h1>          <!-- forme exacte des lettres -->
<div class="plateau" data-obstacle></div>                              <!-- boîte de l'élément -->
<div data-obstacle-forme="ligne" data-de="10 80" data-a="60 95"></div> <!-- ligne invisible, en cqh -->
```

| Déclaration | Effet |
|---|---|
| `data-obstacle` | La boîte de l'élément, même tournée, mise à l'échelle ou animée (les particules posées suivent). |
| `data-obstacle="forme"` | La forme exacte (lettres d'un texte, silhouette d'une image), prise à la fin du minutage de l'élément. Un élément effacé à ce moment ne compte pas (alerte `obstacle-forme-vide`). |
| `data-obstacle="video"` ou `"forme video"` | Idem, et obstacle aussi pour les effets de la scène voisine pendant une transition. |
| `data-obstacle-forme="ligne"` | Ligne invisible : `data-de="x y"`, `data-a="x y"` (cqh). Aussi `cercle` (`data-centre`, `data-rayon`) et `rectangle` (`data-de`, `data-a`, `data-angle` en degrés). |
| Sol et murs | Le bas, la gauche et la droite de l'image sont toujours là ; la recette décale le sol avec `"sol": 90` (cqh depuis le haut). |

Au plus 16 obstacles par scène (les premiers dans l'ordre du document comptent). Un effet garde au plus 48 obstacles (bords, scène, scènes voisines, vidéo) et 8 couches d'empilement ; ceux de la vidéo passent en premier ; au-delà, une alerte dans la console de l'aperçu.

### Obstacles de la vidéo (déroulé)

```json
"obstacles": [ { "type": "sol", "a": 92 }, { "type": "ligne", "de": [0, 80], "a": [40, 95] } ]
```

Types `sol` (`a`), `ligne` (`de`, `a`), `cercle` (`centre`, `rayon`), `rectangle` (`de`, `a`, `angle`) ; au plus 8 obstacles de vidéo, valables dans toutes les scènes.

Couche commune : un effet qui **empile** sur un obstacle de la vidéo (`"empiler": true`, cible `elements`) hérite de la couche laissée par les effets commencés avant lui, quelle que soit leur scène. Chacun compte pour la couche qu'il avait formée au début de l'effet qui hérite (à sa fin s'il était déjà fini ; pendant une transition, sa couche à cet instant). La couche héritée est **dessinée** : une bande qui suit son profil, bord haut adouci, de la couleur à mi-vie des effets qui l'ont formée, dans le calque de l'effet qui hérite ; ses nouvelles particules se posent dessus. Elle n'est visible que **pendant que cet effet est affiché** : sans effet qui empile sur ce sol dans la scène suivante (ou avant son `data-start`), la neige d'une scène ne reste pas au sol. Pour une neige qui tient d'une scène à l'autre, mettre l'effet dans chaque scène, dès le début.

### Réglages d'une recette (`collisions`, par émetteur)

```json
"collisions": { "cibles": ["sol", "elements"], "reponse": "poser", "empiler": true, "talus": 35 },
"a_la_collision": { "emetteur": "eclabousse" }
```

| Champ | Rôle |
|---|---|
| `cibles` | Ce qui arrête les particules : `sol`, `murs`, `elements` (obstacles de la scène et de la vidéo), `formes` (formes exactes). Toutes par défaut. |
| `reponse` | `rebond` (défaut), `poser` (la particule reste sur l'obstacle et le suit), `mourir` (disparaît au contact). |
| `restitution` | Part de la vitesse gardée au rebond, de 0 à 1 (0,4). |
| `frottement` | Part de la vitesse le long de la surface perdue au contact, de 0 à 1 (0,2). |
| `repos_apres` | Secondes avant le fondu d'une particule posée ; absent : elle reste jusqu'à sa mort. |
| `empiler` | Avec `poser` : les particules posées forment une couche qui monte (neige, confettis). |
| `epaisseur` | Épaisseur d'une particule dans la couche, en cqh (par défaut sa taille). |
| `talus` | Pente la plus forte de la couche, en degrés (5 à 80, 35 par défaut). |
| `sol` | Sol décalé, en cqh depuis le haut ; active les collisions même sans obstacle déclaré. |
| `a_la_collision` | `{ "emetteur": "<nom>" }` : sous-émetteur lancé au point de contact, orienté selon la surface (`direction: [0, -1]` = perpendiculaire à la surface). Compte dans les 2 niveaux de sous-émetteurs ; un émetteur n'a qu'un parent. |

Bibliothèque : `confettis` et `neige` se posent et s'empilent, `pluie` meurt au contact et lance `eclabousse`, `etincelles` (et `braises`) rebondissent. Retouche : « la neige doit tenir sur le titre » → `data-obstacle="forme"` sur le titre.

Limites : une couche ne s'écroule pas quand son obstacle bouge, les grains ne roulent pas les uns sur les autres, les particules ne se heurtent pas entre elles (sauf avec un bloc `interactions` : voir « Interactions »). Un émetteur à collisions garde `z` pour la taille et l'ordre de dessin, mais sans décalage de perspective (ses particules restent sur leurs obstacles).

Contrôles : `obstacle-introuvable` (déclaration mal écrite), `collisions-invalides` (recette), `obstacles-video` (déroulé), alerte `trop-d-obstacles` (au-delà de 16 obstacles par scène ou de 8 obstacles de vidéo), alerte `obstacle-forme-vide` (forme exacte invisible à la fin de son minutage ; contrôle de la vidéo rendue, donc avec Chrome ou Edge ; aussi un panneau sur l'effet dans l'aperçu).

## Fragmentation : briser, désintégrer, assembler, métamorphoser

Un élément de la scène (titre, logo, image, bloc) devient des particules, ou des particules deviennent un élément. Le moteur **photographie** l'élément à l'instant voulu, fait naître une particule par groupe de pixels (de leur couleur) ou un éclat par morceau, et **cache ou montre l'élément réel** au bon moment : l'image est la même dans l'aperçu et à l'export.

| Effet | Réglages | Quand l'utiliser |
|---|---|---|
| `briser` | `morceaux`, `impulsion`, `gravite`, `rebond` | Un élément vole en éclats (choc, rupture, idée reçue démolie) : `data-ancre` sur l'élément, au moment du choc. Les éclats rebondissent sur les obstacles déclarés (`data-obstacle`). Sans `data-dur`, les éclats vivent environ 3 s : prévoir la scène en conséquence (sinon alerte `pause-finale` : l'effet serait coupé). |
| `desintegrer` | `densite`, `vent`, `turbulence`, `lueur` | Un élément part en poussière de gauche à droite (disparition, oubli, obsolescence) ; `data-dur` = durée du balayage. |
| `assembler` | `densite`, `arrivee`, `echelonnement`, `etendue` | Un titre ou un logo se forme à partir de particules venues de tout l'écran ; il apparaît à la fin de `data-dur` (ou plus tôt : `arrivee: 0.7`). |
| `metamorphose` | `densite`, `arrivee`, `echelonnement`, `tourbillon` | Un mot ou un pictogramme se transforme en un autre (avant/après, cause/effet) : `data-ancre` = départ, `data-cible` = arrivée. |

```html
<h2 id="mythe" data-texte="mythe" data-start="0.3"></h2>
<div data-effet="desintegrer" data-ancre="#mythe" data-start="3" data-dur="1.5"></div>
<div data-effet="metamorphose" data-ancre="#avant" data-cible="#apres" data-start="2" data-dur="1.5"></div>
```

- Raccords posés par le moteur : `briser` et `desintegrer` cachent l'élément dès leur début ; `assembler` le cache jusqu'à l'arrivée ; `metamorphose` cache l'élément de départ dès le début et celui d'arrivée jusqu'à l'arrivée. Ne pas animer soi-même l'apparition ou la disparition de ces éléments. Le contrôle de la vidéo rendue applique les mêmes raccords : les deux mots d'une `metamorphose` peuvent occuper la même place sans alerte de chevauchement.
- Le moteur ne garde que le **contenu visible** de l'élément (boîte de ses pixels opaques) : un titre en bloc, dont la boîte fait toute la largeur de la scène, se brise en morceaux pris sur ses lettres, se désintègre de sa première à sa dernière lettre pendant `data-dur`, et le point d'impact (`origine`) comme le centre de `ordre: "centre"` se rapportent à ce contenu.
- L'élément doit être visible à l'instant photographié (début de l'effet ; arrivée pour `assembler` et pour l'élément d'arrivée de `metamorphose`) ; il peut ensuite bouger, tourner, grandir : les particules suivent son repère.
- `densite` : une particule pour N pixels (4 par défaut) ; `densite: 1` pour un petit texte (raccord le plus fin), plus haut pour un grand élément. Au-delà d'un million de pixels opaques, la densité est augmentée d'office (alerte `photographie-trop-grande`).
- Ces effets gardent les couleurs exactes de l'élément (`bloom: 0`, `tons: "neutre"`) : ne pas les mettre dans le même calque qu'un effet à halo fort (le calque prend les réglages du bloom le plus fort) ; au besoin, l'un en `data-calque="arriere"`.
- `assembler` arrive de gauche à droite ; pour un autre ordre, une recette dérivée : `{ "version": 1, "etend": "assembler", "emetteurs": [{ "nom": "grain", "cible": { "ordre": "centre" } }] }` (`hasard`, `gauche-droite`, `centre`).

### Réglages d'une recette (fragmentation)

| Champ | Rôle |
|---|---|
| `naissance.forme.type: "pixels"` | Naissance sur les pixels opaques de l'ancre : `densite`, `instant` (photographie : `"debut"`, ou secondes de scène), `liberation` (s : les grains quittent leur place progressivement, sinon tous ensemble), `ordre` (`hasard`, `gauche-droite`, `centre`) |
| `vie.couleur: "source"` | Couleur du pixel d'origine ; dans un dégradé (`["source", "source", "#ffb347", "#0000"]`), multipliée par le reste du dégradé |
| `rendu.type: "eclats"` | Morceaux de la photographie (pavage de Voronoï, plus petits près de l'impact) : `morceaux` (8 à 512), `origine` (point d'impact, fraction de la boîte du contenu visible, `[0.5, 0.5]`), `impulsion` (cqh/s), `rotation_max` (°/s) |
| `cible` | Arrivée sur un élément : `source` (`ancre` ou `cible` = `data-cible`), `arrivee` (`guidee` : forces puis rattrapage, obstacles actifs ; `choree` : trajet calculé, sans obstacles), `a` (`"fin"` ou secondes), `echelonnement` (0 à 1), `ordre`, `guidage` (fraction du trajet où commence le rattrapage, 0,6), `densite`, `courbe` |
| `rendu_calque.tons: "neutre"` | Courbe de tons sans épaule (couleurs exactes) |

Un émetteur de fragmentation naît tout entier au début de l'effet (pas de `debit` ni de `salves`) ; une particule qui vise une `cible` vit jusqu'à l'arrivée (pas de `vie`) et ne peut que rebondir sur les obstacles.

Contrôles : `ancre-vide` (pas de `data-ancre`, ou élément invisible à l'instant photographié : l'effet n'est pas affiché, l'élément reste visible), `cible-introuvable` (`data-cible` mal écrit), `metamorphose-sans-cible` (recette qui vise `cible` sans `data-cible`), alerte `photographie-trop-grande`.

Limites : pas de fracture réaliste (les éclats sont des polygones de Voronoï), pas de découpe vectorielle des lettres, pas d'éléments 3D, pas de fragmentation d'une scène entière d'un seul tenant.

## Interactions : essaims, fluides, grains

Les particules d'un émetteur peuvent **interagir entre elles** : une nuée d'oiseaux qui garde ses distances, de l'eau qui coule et remplit une cuve, du sable qui forme un vrai tas et s'écroule quand son support bouge. Un bloc `interactions` dans l'émetteur suffit ; le reste de la recette (naissance, forces, collisions, couleurs) ne change pas.

| Effet | Réglages | Quand l'utiliser |
|---|---|---|
| `nuee` | `nombre`, `vitesse`, `taille`, `couleur` | Collectif, mouvement d'ensemble, migration ; calque arrière, ancre sur une zone dégagée (la nuée tourne autour). |
| `banc` | `nombre`, `vitesse`, `couleur1`, `couleur2` | Mer, équipe, foule qui avance ensemble ; deux teintes dans un même banc. |
| `lucioles` | `nombre`, `couleur`, `eclat`, `vitesse` | Nuit, magie, idées qui flottent ; halo doux, petits groupes lâches. |
| `eau` | `nombre`, `couleur`, `refraction`, `gravite` | Eau versée depuis l'ancre qui remplit ce qui l'arrête : déclarer un sol ou une cuve (`data-obstacle`). |
| `miel` | `nombre`, `couleur`, `refraction`, `gravite` | Liquide épais et lent (miel, sirop, lave) ; dérivé de `eau`. |
| `sable` | `nombre`, `couleur`, `taille`, `frottement` | Sablier, temps qui passe, accumulation ; le tas s'écroule si son support bouge. |
| `neige-lourde` | `nombre`, `vitesse`, `taille`, `couleur` | Neige collante qui forme de vrais tas sur les obstacles ; plus coûteuse que `neige`. |

```html
<div id="cuve" data-obstacle data-start="0"></div>
<div data-effet="eau" data-ancre="#robinet" data-start="1" data-dur="2"></div>
```

### Réglages d'une recette (`interactions`, par émetteur)

```json
"interactions": { "type": "fluide", "rayon": 2, "viscosite": 0.05, "avec": ["autre-goutte"] }
```

| Champ | Rôle |
|---|---|
| `type` | `essaim`, `fluide` ou `grains`. |
| `rayon` | Rayon d'interaction en cqh (2) ; pour des grains, au moins leur taille maximale. |
| `avec` | Autres émetteurs du même effet qui interagissent avec celui-ci (même type ; 8 émetteurs liés au plus). |
| `separation`, `alignement`, `cohesion` | Essaim : poids de 0 à 5 (1,5 ; 1 ; 1). |
| `vision` | Essaim : `{ "rayon": 6, "angle": 270 }` (cqh, degrés) : ce que chaque individu voit devant lui. |
| `vitesse` | Essaim : vitesse bornée `[min, max]` en cqh/s (`[5, 20]`). |
| `cible` | Essaim : point visé, fraction de la zone (`[0.5, 0.5]`) ou `"ancre"`. |
| `fuite` | Essaim : évitement des obstacles vus devant (30) ; un attracteur à force négative de la recette repousse aussi. |
| `densite` | Fluide : particules par cellule au repos (6). |
| `viscosite` | Fluide : de 0 (eau) à 1 (miel épais) (0,05). |
| `tension` | Fluide : cohésion de surface de 0 à 1 (0,1) : gouttes qui tiennent et fusionnent. |
| `incompressibilite` | Fluide : itérations, de 2 à 6 (4) ; plus : moins compressible, plus coûteux. |
| `frottement` | Grains : `{ "statique": 0.6, "dynamique": 0.4 }` ; le tas prend l'angle dont la tangente vaut `statique` (0,6 : 31°). |
| `cohesion` (grains) | De 0 à 1 (0) : grains collants (neige mouillée). |
| `restitution` | Grains : rebond entre grains, de 0 à 1 (0,1). |

Rendu `fluide` (dans `rendu`) : une nappe lisse au lieu de points.

| Champ | Rôle |
|---|---|
| `"type": "fluide"` | Nappe en espace écran : particules fondues en une surface, avec reflet. |
| `teinte` | Couleur du fluide (`#4aa8ff`). |
| `opacite` | De 0 à 1 (0,85). |
| `absorption` | Assombrissement selon l'épaisseur, par cqh (0,25) : une flaque fine est claire, une cuve profonde dense. |
| `refraction` | De 0 à 1 (0) : la scène vue déformée à travers le fluide (photographie de la scène : approchée dans l'aperçu, exacte à l'export). |
| `lissage` | Rayon du lissage de la nappe, en cqh (1). |

- Obstacles : les `collisions` (réponse `rebond` ou `mourir`) s'appliquent aux trois types ; les grains forment eux-mêmes leur tas : ni `poser` ni `empiler` avec `interactions`.
- Coût : jusqu'à 100 000 particules par émetteur en essaim, 60 000 en fluide ou en grains ; un fluide ou des grains coûtent bien plus que des particules simples : partir des réglages de la bibliothèque.
- Déterminisme : dans une même sortie (aperçu, export rapide ou export fidèle), l'image ne dépend que de l'instant, quel que soit l'ordre des retours en arrière, et deux exports du même mode sont identiques. D'une sortie à l'autre, un essaim, un fluide ou des grains gardent la même allure, mais pas forcément la même image au pixel près : la mise en page diffère d'un millième de cqh selon la taille de la page, les mesures arrondies au 1/64 de cqh l'absorbent presque toujours, et un écart restant est amplifié par les interactions.

Contrôles : `interactions-invalides` (type inconnu, `avec` vers un émetteur absent, sans `interactions` ou d'un autre type, émetteur de fragmentation, réponse `poser`, grain plus grand que `rayon`, `rayon` de grains au-delà de 8,9 × leur taille minimale), alerte `budget-interactions` (au-delà des limites par émetteur, ou plus de 48 particules en moyenne par cellule de voisinage, étalées sur toute la scène). Une cellule de voisinage (carré de côté `rayon`, ou `vision.rayon` pour un essaim) compte au plus 96 particules ; au-delà, pour ce pas, ses particules s'ignorent entre elles (elles se traversent) : un essaim nombreux à grande `vision` qui se resserre sur sa cible y arrive vite. Dans l'aperçu, la console signale une réfraction ignorée tant que la photographie de la scène n'est pas prête.

Limites : pas de mélange de fluides (eau et huile), pas de grains de forme complexe, une corde ou un tissu se lie à des particules par `avec` (voir « Cordes et tissus »).

## Cordes et tissus

Un émetteur peut être une **corde** (fil, guirlande) ou un **tissu** (drapeau, bannière, rideau, filet) : des sommets reliés qui pendent, flottent au vent, se posent sur les obstacles et se déchirent. Ses attaches le tiennent aux éléments de la scène et les suivent quand ils bougent.

| Effet | Réglages | Quand l'utiliser |
|---|---|---|
| `drapeau` | `vent`, `ondulation`, `couleur1`, `couleur2`, `couleur3` | Identité, appartenance, victoire : drapeau aux couleurs de la charte, tenu au bord gauche de l'ancre (le mât) ; l'ancre est sa place au repos. |
| `banniere` | `vent`, `chute`, `gravite` | Un titre ou un logo qui devient un tissu, flotte puis se détache et tombe (sur les obstacles déclarés) ; l'élément est caché pendant ce temps. |
| `rideau` | `ouverture`, `resistance`, `couleur` | Dévoilement : rideau posé sur ce qu'il cache, tenu par son bord haut en deux moitiés qui s'écartent (`ouverture` : part de la largeur dont chaque moitié s'écarte, 0,2) ; fendu en son milieu (`fente`), il s'ouvre jusqu'en bas et ses deux pans pendent (s'il est peu résistant, ils se déchirent et leurs morceaux tombent). |
| `guirlande` | `couleur`, `eclat`, `mou`, `vent` | Fête, chaleur : ampoules sur un fil qui pend d'un bord à l'autre de la zone (balise placée d'un élément à l'autre). |
| `filet` | `resistance`, `souplesse`, `couleur` | Retenir ce qui tombe (élément animé déclaré `data-obstacle`, particules liées), jusqu'à céder. |
| `corde` | `couleur`, `epaisseur`, `vent` | Suspension, tension : corde qui pend du milieu du bord haut de la zone et se balance. |

```html
<h1 id="titre" data-texte="titre" data-start="0"></h1>
<div data-effet="banniere" data-ancre="#titre" data-start="2" data-dur="4"></div>
```

### Réglages d'une recette (`structure`, par émetteur)

```json
"structure": {
  "type": "tissu", "resolution": [24, 16],
  "attaches": [{ "ou": "haut", "a": "ancre" }, { "ou": "coins", "a": "#cadre", "lacher": 2.5 }],
  "raideur": 0.9, "flexion": 0.1, "amortissement": 0.02, "dechirure": 1.6, "epaisseur": 0.4,
  "apparence": { "couleur": "primaire", "lumiere": [-0.4, -1] }
}
```

| Champ | Rôle |
|---|---|
| `type` | `corde` ou `tissu`. |
| `resolution` | Corde : nombre de sommets (8 à 128, 32) ; tissu : `[colonnes, lignes]` (`[24, 16]` ; 64 × 64 au plus sans alerte, 128 × 128 au plus). |
| `attaches` | Sommets tenus (16 attaches au plus) : liste de `{ "ou": …, "a": …, "lacher": … }`. |
| `fente` | Tissu : indice de colonne (1 à colonnes − 1) ; la couture entre cette colonne et la précédente est coupée sur toute la hauteur dès le début (aucun lien ne la traverse) : un rideau s'ouvre en deux pans jusqu'en bas. Absent : aucune. |
| `raideur` | De 0 (élastique) à 1 (inextensible) (0,9). |
| `flexion` | Raideur au pliage, de 0 (aucune) à 1 (presque rigide) (0,1) : jusqu'à 0,5 un tissu souple, qui se drape ; au-delà, chaque dixième le rend nettement plus raide (carton à 1). Un tissu résiste un peu à la compression : il ne se froisse pas sous un vent irrégulier, il se plie et peut encore se poser à plat. |
| `amortissement` | De 0 à 1 (0,02) : calme les oscillations. |
| `dechirure` | Étirement de rupture d'un lien (1,6 : un lien rompt à 160 % de sa longueur ; au moins 1,05) ; absent : indéchirable. |
| `epaisseur` | En cqh (0,4) : largeur d'une corde, distance gardée aux obstacles. |
| `perles` | Corde : `{ "tous": 4, "emetteur": "ampoule" }`, une particule de l'émetteur `emetteur` tous les `tous` sommets (ampoules, fanions). |
| `apparence` | Couleur, texture, éclairage (ci-dessous). |

Attaches :

| Champ | Rôle |
|---|---|
| `ou` | Sommets tenus : `debut`, `fin` (corde) ; `haut`, `bas`, `gauche`, `droite`, `coins` (tissu) ; ou indices (`5`, `[0, 12]`, `"0, 12"`). |
| `a` | `ancre` (défaut : l'ancre, ou la balise sans `data-ancre`), `#id` d'un élément de la même scène (7 au plus par effet), ou point `[x, y]` en fraction de la zone (un seul sommet). `ancre` : un bord tenu se pose sur le même bord de l'élément. `#id` : les sommets tenus gardent leur place de repos (celle de la zone) et suivent l'élément (déplacement, rotation, échelle) sans être étirés sur son bord : un fanion de 14 cqh sur un mât de 40 cqh reste haut de 14 cqh. Un élément absent ou masqué ne tient plus. |
| `lacher` | Instant (s depuis le début de l'effet) où l'attache se libère ; absent : jamais. |
| `glisse` | `{ "vers": [x, y], "duree": 1 }` : les sommets tenus s'écartent de leur place de `vers` (fraction de l'élément visé, ou de la zone pour un point), en douceur, en `duree` secondes depuis le début de l'effet (rideau qui s'ouvre). |

Apparence :

| Champ | Rôle |
|---|---|
| `couleur` | Teinte (`#ffffff`) : seule, ou qui multiplie le dégradé, l'image, la photographie. |
| `degrade` | Couleurs (charte comprise) le long de la largeur ou de la hauteur d'un tissu, le long d'une corde. |
| `sens` | Du dégradé : `horizontal` (défaut) ou `vertical`. |
| `bandes` | `true` : aplats nets (drapeau) au lieu d'un dégradé lissé. |
| `image` | Image du projet (`assets/…`, PNG, WebP, JPEG ou SVG) plaquée sur le tissu. |
| `source` | `"ancre"` : la photographie de l'ancre (`data-ancre` obligatoire) ; au départ, le tissu la recouvre exactement et l'élément est caché tant que le tissu le remplace. |
| `mailles` | Tissu : `true`, seules les mailles sont dessinées (filet). |
| `lumiere` | Direction de la lumière (`[-0.4, -1]` : depuis le haut à gauche) : éclaire les plis ; le revers d'un tissu replié est plus sombre. |

Une seule texture parmi `degrade`, `image` et `source`. Un émetteur `structure` n'a ni `debit`, ni `salves`, ni `vie`, ni `rendu` (seuls `naissance.masse` et `naissance.z`) ; il prend les `forces` de la recette (gravité, vent, turbulence, attracteurs) et ses `collisions` (réponse `rebond`) avec les obstacles déclarés. L'émetteur des perles n'a que `naissance.taille`, `naissance.z`, `naissance.rotation`, ses couleurs de `vie` et son `rendu`.

- Particules liées : un émetteur à `interactions` (grains, fluide, essaim) qui nomme la corde ou le tissu dans `avec` ; ses particules s'y posent ou s'en écartent, la structure ploie sous leur poids (`epaisseur` au plus le `rayon` du groupe).
- Pose : au début de l'effet, une corde pend déjà (en chaînette entre deux bouts tenus, à la verticale sous un seul) et un tissu est posé sur ses attaches ; aucun saut aux premières images.
- Coût : 16 cordes et tissus par scène, 64 × 64 sommets par tissu. Mesuré sur une carte graphique récente (NVIDIA, 2023) : 16 tissus de 64 × 64 en 3,3 à 3,7 ms par image (groupes de 1024 fils) ; en 5,5 ms à 256 fils (adaptateur qui n'en permet pas davantage, ou pilote qui refuse 1024 fils : le moteur se replie alors à 256, même image au bit près). Sur une machine modeste, compter plusieurs fois ce temps : l'aperçu saccade au-delà de quelques tissus de cette taille ; l'export reste exact.
- Déterminisme : l'image ne dépend que de l'instant, déchirures comprises.

Contrôles : `structure-invalide` (bloc mal écrit, attache impossible, perles mal déclarées, champ interdit sur une structure), `attache-introuvable` (`#id` absent de la scène), `ancre-vide` (tissu fait de son ancre sans `data-ancre`, ou ancre invisible au début de l'effet), alerte `budget-structures` (plus de 16 cordes et tissus par scène, ou tissu de plus de 64 × 64 sommets ; même sous ces limites, une machine modeste peut saccader à l'aperçu).

Limites : pas de contact d'un tissu avec lui-même (il se traverse en se repliant), pas de tissu en volume (gonflable), pas de corps mous (gelée).

## Milieux : fumée, feu, encre

Un **milieu** est un fluide simulé sur une grille dans la scène : fumée volumineuse qui monte et s'enroule, feu coloré par sa température, encre qui se mêle dans l'eau. Il contourne les obstacles déclarés (`data-obstacle`, formes exactes) ; un obstacle qui bouge ou qui tourne le brasse. Il sert aussi de vent aux effets de la scène qui s'y couplent (braises emportées, drapeau qui claque) et ses effets peuvent l'alimenter (panache d'une fusée). Un seul milieu par scène (un par scène).

| Effet | Réglages | Quand l'utiliser |
|---|---|---|
| `air` | `resolution`, `flottaison`, `debit`, `couleur`, `opacite` | Ambiance, mystère, chaleur qui monte : fumée volumineuse depuis le bas de la scène, qui contourne les obstacles déclarés ; vent des effets couplés. |
| `brasier` | `intensite`, `chaleur`, `largeur`, `fumee` | Combustion, danger, énergie : feu du rouge sombre au blanc selon sa température, qui brille (halo), surmonté de fumée. |
| `eau-encre` | `couleur1`, `couleur2`, `debit`, `tourbillons` | Idées qui se mêlent, diffusion, calme : deux encres (charte) qui coulent en volutes et se mélangent par absorption ; sur fond clair. |
| `braises-portees` | `nombre`, `vitesse`, `couleur`, `gravite`, `taille`, `prise` | Braises emportées par le milieu de la scène : elles suivent le panache et tourbillonnent autour des obstacles (`prise` : force de l'entraînement). |
| `fusee-panache` | `fusees`, `vitesse`, `fumee`, `couleur` | Lancement, décollage : fusées qui montent en laissant dans le milieu un panache de fumée chaude qui s'élargit. |

```html
<div data-milieu="air" data-reglages="resolution: 192; flottaison: 1.2" data-start="0" data-dur="8"></div>
<div id="foyer"></div>
<div data-effet="braises-portees" data-ancre="#foyer" data-start="1" data-dur="5"></div>
```

Balise : `data-milieu="nom"` ; `data-ancre="#id"` (zone du milieu : l'élément au début du milieu ; sans : la scène entière) ; `data-calque` (`arriere` par défaut, ou `avant`) ; `data-reglages` ; `data-start` ; `data-dur` (sans : jusqu'à la fin de la scène).

### Réglages d'une recette de milieu (`milieu`, à la racine, sans `emetteurs`)

```json
"milieu": {
  "resolution": 192, "flottaison": 1.0, "refroidissement": 0.6, "dissipation": 0.3, "vorticite": 0.4, "viscosite": 0, "bords": "ouverts",
  "sources": [{ "type": "fumee", "forme": { "type": "rectangle", "largeur": 24, "hauteur": 4, "decalage": [0, 40] }, "debit": 3, "temperature": 0.6 }],
  "rendu": { "type": "fumee", "couleur": "#8a8f99", "corps_noir": true, "opacite": 0.8, "intensite": 3, "lumiere": [-0.4, -1] }
}
```

| Champ | Rôle |
|---|---|
| `resolution` | Cellules sur le grand côté de la zone (192 ; 64 à 1024 ; au-delà de 512, alerte) ; cellules carrées, grille échantillonnée en bicubique (aucune cellule visible). |
| `flottaison` | La chaleur monte (1) ; négative, elle descend (encre plus lourde que l'eau) ; de −5 à 5. |
| `refroidissement` | Perte de chaleur par seconde (0,6). |
| `dissipation` | Disparition de la fumée et de l'encre par seconde (0,3). |
| `vorticite` | Tourbillons entretenus (0,4 ; de 0 à 2). |
| `viscosite` | De 0 (défaut) à 1 : un fluide épais s'écoule lentement. |
| `bords` | `ouverts` (défaut : la fumée sort de la zone) ou `fermes` (une cuve). |
| `sources` | 8 au plus : `{ "type": …, "forme": {…}, "debit": 1, "temperature": 0, "couleur": … }` (ci-dessous). |
| `rendu` | `type`, `couleur`, `corps_noir`, `opacite`, `intensite`, `lumiere` (ci-dessous). |

Sources :

| Champ | Rôle |
|---|---|
| `type` | `fumee` (densité, et chaleur `temperature`), `chaleur` (seule), `encre` (couleur obligatoire, et chaleur `temperature`). |
| `forme` | Comme la forme d'émission d'un effet : `point`, `cercle`, `anneau`, `rectangle`, `ligne`, `ancre` (toute la zone) ; centrée sur la zone, `decalage` en cqh, `angle`. |
| `debit` | Quantité apportée par seconde (1). |
| `temperature` | Chaleur apportée avec la fumée ou l'encre (0 à 5). |
| `couleur` | Encre : `#rrggbb` ou couleur de la charte. |

Rendu :

| Champ | Rôle |
|---|---|
| `type` | `fumee` (ombrée d'elle-même), `feu` (la fumée, plus la lumière émise selon la température) ou `encre` (absorption : les encres se mélangent comme des pigments ; exacte sur fond clair). |
| `couleur` | Couleur de la fumée (`#8a8f99`). |
| `corps_noir` | Feu : couleur du corps noir selon la température, du rouge sombre au blanc (`true`) ; `false` : `couleur`. |
| `opacite` | De 0 à 1 (0,8). |
| `intensite` | Éclat du feu (3) : au-delà de 1, il nourrit le halo du calque (`rendu_calque.bloom`). |
| `lumiere` | Direction de la lumière (`[-0.4, -1]` : depuis le haut à gauche) : la fumée est plus claire de ce côté. |

### Couplages (dans les recettes des effets de la scène)

| Déclaration | Effet |
|---|---|
| Force `{ "type": "milieu", "coef": 1 }` (émetteur, essaim) | Particules entraînées par le vent du milieu : `coef` × (vent − vitesse) / masse, comme la force `vent`. |
| `"milieu": { "coef": 1 }` dans une `structure` | Corde ou tissu poussé par le vent selon sa surface exposée (un pli replié, une corde dans le sens du vent offrent moins de prise). |
| `"injecte": { "fumee": 0.2, "chaleur": 0.5, "encre": "couleur" }` (émetteur, bloc `injecte`) | Dépôt dans le milieu, là où passe chaque particule (par seconde) : `fumee`, `chaleur`, `encre` (une couleur, ou `couleur` : celle de la particule au cours de sa vie). |

- Groupe couplé : le milieu et les effets couplés de sa scène avancent ensemble (les particules lisent le vent, déposent, puis la grille avance) ; les autres effets restent indépendants. Un effet couplé dans une scène sans milieu valide est refusé (`couplage-sans-milieu`).
- Coût : grille de 256 × 144 (résolution 256 en 16:9) avec 100 000 particules couplées : moins de 6 ms de simulation par image visées ; mesuré sur une carte graphique récente (NVIDIA, 2023) : 3,6 ms de simulation par image, image 1080p complète (simulation, particules, milieu) en 4 ms ; au-delà de 512 cellules sur le grand côté, alerte. Sur une machine modeste, l'aperçu peut saccader ; l'export reste exact.
- Déterminisme : l'image ne dépend que de l'instant, milieu et effets couplés compris.

Contrôles : `milieu-invalide` (recette sans bloc `milieu` posée en `data-milieu`, milieu posé en `data-effet`, bloc mal écrit, `data-calque` inconnu), `deux-milieux` (un seul milieu par scène : le premier est gardé), `couplage-sans-milieu`, alerte `budget-milieu` (plus de 512 cellules sur le grand côté) ; `ancre-introuvable` pour un `data-ancre` absent. Dans l'aperçu, un panneau signale le milieu en erreur.

Limites : pas de fluide en volume (3D), pas de combustion chimique, un milieu par scène, pas de surface libre de liquide (l'eau qui ruisselle : voir « Interactions », fluide de particules).

## Régler à l'œil : l'atelier

Quand la personne veut régler un effet en le regardant (« laisse-moi régler les étincelles », « je veux voir ce que ça donne »), ou pour vérifier un effet de la bibliothèque :

- **Dans l'aperçu** : bouton **Effets** du lecteur. Choisir l'effet dans la liste (ou cliquer dessus dans l'image) ; les curseurs des réglages changent l'image tout de suite, sans recharger, et la lecture boucle sur l'effet. « Enregistrer » écrit `data-reglages` et `data-graine` dans la scène. « Recette complète » donne tous les champs de la recette ; « Enregistrer comme nouvel effet » écrit `effets/<nom>.json` (par `etend`) et fait pointer la balise dessus.
- **Hors de la vidéo** : `pulse-motion atelier [<effet>]` en arrière-plan, depuis le dossier de la vidéo, ouvre la page d'atelier : l'effet seul en boucle, fond clair (charte) ou sombre, zone d'émission à déplacer et redimensionner à la souris ; « Enregistrer » écrit dans `effets/` du projet (les réglages choisis deviennent les valeurs par défaut).
- Chaque enregistrement passe par l'historique : « annule » le défait. Si la scène a été modifiée entre-temps (une retouche), l'atelier refuse d'écrire et propose de recharger la page : rien n'est écrasé.
- Noms des nouveaux effets : minuscules, chiffres et tirets, différents de ceux de la bibliothèque (et de ceux du projet, sauf remplacement confirmé).
- Après un enregistrement, lire la scène ou la recette écrite pour savoir ce que la personne a choisi avant de retoucher autre chose.

## Signaux d'alerte

| Vous écrivez… | Problème | À la place |
|---|---|---|
| Trois effets devant un texte de 20 mots | Illisible, contrôle `effet-sur-texte` | Un seul, en `arriere`, ou après la lecture |
| `data-reglages="quantite: 300"` | Réglage inconnu (`reglage-invalide`) | Les réglages de la table |
| `data-ancre="titre"` | Il manque `#` | `data-ancre="#titre"` |
| Une recette recopiée et modifiée en entier | Difficile à retoucher | `etend` + les seuls changements |
| `nombre: 20000` sur une scène qui en a déjà | `budget-particules` | Baisser `nombre` ou la durée de vie |
| `data-obstacle="formes"` | Valeur inconnue (`obstacle-introuvable`) | `data-obstacle="forme"` |
| `metamorphose` sans `data-cible` | `metamorphose-sans-cible` | `data-cible="#id"` de l'élément d'arrivée |
| Une animation CSS qui fait disparaître l'élément d'un `desintegrer` | Double disparition | Laisser le moteur cacher l'élément |
