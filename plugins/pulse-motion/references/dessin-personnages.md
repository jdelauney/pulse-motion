# Dessiner un personnage

## L'essentiel

- Un personnage dessiné est un fichier `personnages/dessins/<nom>.json` dans le dossier de la vidéo : un SVG par os (« pièce »), et par vue. Il s'anime avec les mêmes poses et mouvements que les bâtonnets.
- Partir de l'exemple : `pulse-motion personnages afficher touffu --type dessin`. Garder sa structure, changer les formes et les couleurs.
- Chaque pièce se dessine **« os debout »** : le pivot (l'articulation de départ) est en (0, 0), l'os descend vers +y sur sa longueur. Le moteur le tourne et l'allonge lui-même.
- Le **profil** (personnage tourné vers la droite) est obligatoire ; ajouter `face` (et `troisQuarts`, `dos`) seulement si le personnage doit se tourner vers la caméra. La vue de gauche est le miroir de celle de droite.
- Formes permises : `g`, `path`, `circle`, `ellipse`, `rect`, `polygon`, `polyline`, `line`, avec des attributs de dessin. Pas de texte, d'image, de style, de script, de `url(`.
- Couleurs : toujours `var(--nom)`, déclarées dans `couleurs` (« change sa tenue en rouge » = changer une couleur).
- Vérifier, puis regarder (avec `Read`) avant de montrer :
  1. `pulse-motion personnages verifier --dossier .`
  2. `pulse-motion personnages planche marche --dessin <nom> --vues 0,45,90,-90 --dossier .` (le corps en mouvement)
  3. `pulse-motion personnages planche --dessin <nom> --visage --dossier .` (expressions et bouches)
  Corriger (trois tours au plus) : tête séparée du corps dans une vue, élément présent dans une vue et absent d'une autre, trou ou pointe aux articulations, pièce à l'envers, visage décalé, bouche illisible.

## Repère et longueurs (gabarit standard)

```
        cou (0, -82)         torse : du bassin (0, 0) vers le haut, y de 0 à -82
          |                  tête : centrée sur son centre, ellipse rx 34, ry 50 (68 de large, 100 de haut)
        bassin (0, 0)
   cuisse : 0 → 68 (vers +y)   tibia : 0 → 68   pied : à plat depuis la cheville, 0 → 15 vers +x
   bras : 0 → 50               avant-bras : 0 → 46   main : depuis le poignet, vers +y
```

- **Cohérence entre les vues** : chaque vue dessinée (profil, 3/4, face, dos) a les mêmes éléments aux mêmes proportions ; le cou (ou le haut du torse) recouvre le bas de la tête **dans chaque vue** (sinon la tête flotte) ; un élément ajouté dans une vue (cou, col, accessoire, mèche) l'est dans toutes. Sur les planches, comparer les vues entre elles, pas seulement chacune pour elle-même.
- Une pièce **déborde de son pivot** (bouts arrondis, `rx`) : une cuisse de 68 se dessine de y = -7 à y = 75, pour recouvrir le genou sans trou ni pointe.
- Avant de l'animal ou du personnage : +x (vers la droite, de profil).
- Pièces `…Arriere` absentes : on reprend la pièce `…Avant`. Os sans pièce : rien n'est dessiné.
- Gabarit : `"gabarit": "standard"`, ou des proportions en ligne (`{ "cuisse": 55, "tibia": 50, "tete": { "rx": 42, "ry": 46 } }`) ; dessiner alors les pièces aux nouvelles longueurs.
- Membres éloignés plus sombres : `fill='var(--teinte-loin, var(--tenue))'` et une couleur `dos`.

## Accessoires

```json
{ "nom": "toque", "os": "tete", "devant": true, "dessins": { "profil": "<rect …/>" } }
```

Même repère que l'os (tête : centre de la tête). `devant: false` (par défaut) : derrière la pièce (cape, sac à dos).

## Visage

- `oeil` : `blanc` (obligatoire, formes simples sans `g` : il sert aussi à découper pupille et paupière), `pupille`, `paupiere` (dessinée pour couvrir tout l'œil, elle remonte quand l'œil s'ouvre), `course` (recul des pupilles, 4), `hauteur` (course de la paupière, 24).
- `sourcil` : un trait, centré en (0, 0).
- `bouches` : `neutre` obligatoire ; expressions `sourire`, `rire`, `triste`, `surprise`, `colere` ; visèmes (pour la voix) `repos`, `A`, `E`, `I`, `O`, `U`, `MBP`, `FV`, `L`. Une bouche absente est remplacée par la plus proche.
- `vues` (repère de la tête) : `profil` obligatoire, `troisQuarts`, `face` ; chacune `{ "yeux": [[x, y], …], "sourcils": [[x, y], …], "bouche": [x, y] }`. De dos, le visage est caché.
- Les poses et clés choisissent `"expression": "joie"` (neutre, joie, tristesse, peur, colere, surprise) et `"bouche": "O"` ; `sourcilsY` (levés) et `sourcilsAngle` (positif : colère, négatif : tristesse) se règlent comme les angles.

## Style

- Formes simples, peu de points ; un trait d'épaisseur constante (`var(--trait)`, 3 à 4).
- D'abord le profil complet, puis la face, puis le 3/4 si le personnage tourne souvent.
- Garder le style de la vidéo (couleurs de la charte quand c'est possible).
