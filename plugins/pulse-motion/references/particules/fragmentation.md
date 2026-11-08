# Fragmentation : briser, désintégrer, assembler, métamorphoser

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

## Réglages d'une recette (fragmentation)

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

