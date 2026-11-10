# Vidéo explicative : flèches, annotations et dessins

Lire cette partie pour une scène qui relie des éléments par une flèche, met un mot en valeur au moment où la voix le dit, ou dessine à main levée. La voix pose le rythme : un dessin se trace quand la voix le nomme (`data-start="mot:…"`, voir `pulse-motion reference audio/ancres`). « Ce qui se dit se montre » et « un changement toutes les 2 à 4 s » : `pulse-motion reference realisation`.

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

## Encre des styles

Un style qui peint son encre dans son propre canevas (fusions permises) pose `data-encre="style"` sur la scène et s'inscrit par `M.dessin.encreStyle(fn)` : le calque garde ses nœuds, ses boîtes et ses étiquettes sans peindre l'encre, et `fn(idScene, traces)` reçoit à chaque image les tracés (`M.dessin.traces(idScene)` : chemin à main levée, part tracée de 0 à 1, épaisseur, couleur résolue, calque). Sans canevas inscrit, l'encre reste dans le SVG, opaque à 0,94, sans fusion.

## Ce qui casse

- `Math.random` dans `M.dessin` : il change à chaque image ; prendre `d.hasard(i)`.
- Un texte écrit dans le HTML ou dans le script : toute étiquette est une clé du déroulé (`data-texte`, `d.etiquette('cle')`).
- Une cible appelée avant d'exister, ou un id mal écrit : `fleche-cible-introuvable`.
- Un mot de repère dit deux fois : la première fois compte (`mot:froid#2` pour la seconde).
- Une flèche vers un élément qui traverse l'image sans `data-fleche-suivre` : elle vise sa place d'arrivée.
- Une annotation sur un bloc entier : elle prend toute sa largeur ; viser le `<span>` du mot.

## Retouches en une phrase

| La personne dit | Faire |
|---|---|
| « ajoute une flèche de Client à Serveur quand je dis envoie » | `<i data-fleche="#client → #serveur" data-start="mot:envoie">` (donner les `id` s'il le faut) |
| « mets "requête" sur la flèche » | clé du déroulé et `<span data-texte="…">` dans la flèche |
| « entoure le prix quand je dis cher » | `<i data-annoter="entoure" data-cible="#prix" data-start="mot:cher">` |
| « souligne, surligne, barre, encadre ce mot » | le type d'annotation qui convient |
| « plus dessiné », « comme au tableau » | `--pm-trait: main` sur la scène ; « qui frémit » : `--pm-ebullition: 8` |
| « la flèche plus courbe », « dans les deux sens » | `data-fleche-courbe="0.4"`, `data-fleche-tete="deux"` |
