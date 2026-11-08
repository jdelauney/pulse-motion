# Milieux : fumée, feu, encre

Un **milieu** est un fluide simulé sur une grille dans la scène : fumée volumineuse qui monte et s'enroule, feu coloré par sa température, encre qui se mêle dans l'eau. Il contourne les obstacles déclarés (`data-obstacle`, formes exactes) ; un obstacle qui bouge ou qui tourne le brasse. Il sert aussi de vent aux effets de la scène qui s'y couplent (braises emportées, drapeau qui claque) et ses effets peuvent l'alimenter (panache d'une fusée). Un seul milieu par scène (un par scène).

| Effet | Réglages | Quand l'utiliser |
|---|---|---|
| `air` | `resolution`, `flottaison`, `debit`, `couleur`, `opacite` | Ambiance, mystère, chaleur qui monte : fumée volumineuse depuis le bas de la scène, qui contourne les obstacles déclarés ; vent des effets couplés. |
| `brasier` | `intensite`, `chaleur`, `largeur`, `fumee` | Combustion, danger, énergie : feu du rouge sombre au blanc selon sa température, qui brille (halo), surmonté de fumée. Sur fond sombre : le feu est de la lumière ajoutée ; sur fond clair, il paraît pâle. |
| `eau-encre` | `couleur1`, `couleur2`, `debit`, `tourbillons` | Idées qui se mêlent, diffusion, calme : deux encres (charte) versées l'une au-dessus de l'autre, qui coulent en volutes, se rencontrent et se mélangent par absorption (dès 2 à 3 s) ; sur fond clair. |
| `braises-portees` | `nombre`, `vitesse`, `couleur`, `gravite`, `taille`, `prise` | Braises emportées par le milieu de la scène : elles suivent le panache et tourbillonnent autour des obstacles (`prise` : force de l'entraînement). |
| `fusee-panache` | `fusees`, `vitesse`, `fumee`, `couleur` | Lancement, décollage : fusées qui montent en laissant dans le milieu un panache de fumée chaude qui s'élargit. |

```html
<div data-milieu="air" data-reglages="resolution: 192; flottaison: 1.2" data-start="0" data-dur="8"></div>
<div id="foyer"></div>
<div data-effet="braises-portees" data-ancre="#foyer" data-start="1" data-dur="5"></div>
```

Balise : `data-milieu="nom"` ; `data-ancre="#id"` (zone du milieu : l'élément au début du milieu ; sans : la scène entière) ; `data-calque` (`arriere` par défaut, ou `avant`) ; `data-reglages` ; `data-start` ; `data-dur` (sans : jusqu'à la fin de la scène ; avec : le milieu s'arrête net à la fin de `data-dur`, et les effets couplés qui durent plus longtemps ne reçoivent plus de vent).

## Réglages d'une recette de milieu (`milieu`, à la racine, sans `emetteurs`)

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

## Couplages (dans les recettes des effets de la scène)

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

