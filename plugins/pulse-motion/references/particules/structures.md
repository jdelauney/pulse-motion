# Cordes et tissus

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

Durée : une corde ou un tissu est un objet posé, pas une émission. Un effet fait uniquement de structures (cordes, tissus, et leurs perles) **sans `data-dur` dure jusqu'à la fin de sa scène** (comme un milieu ou un fond), à partir de son début réel (`data-start` absolu, en temps, ou relatif : `#id`, `mot:`) ; avec `data-dur`, il disparaît à la fin de `data-dur`. Un effet qui mêle une structure et des particules émises suit la règle commune (`data-dur` = durée d'émission, 1 s par défaut).

## Réglages d'une recette (`structure`, par émetteur)

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

