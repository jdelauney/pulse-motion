# Découper une illustration

## L'essentiel

- La personne fournit l'illustration d'un personnage (SVG). On écrit sa **découpe** (`personnages/decoupes/<nom>.json`) : chaque forme rangée dans un os, et les articulations lues sur l'illustration. `pulse-motion personnages decouper <nom> --dossier .` en fait un personnage dessiné (`personnages/dessins/<nom>.json`) qui s'anime avec toutes les poses et tous les mouvements.
- Toujours commencer par `pulse-motion personnages analyser assets/<fichier>.svg --dossier .` : liste des formes (numéro, sélecteur, calque, boîte `[x, y, largeur, hauteur]`, couleurs) et PNG annoté avec une grille de coordonnées. Les coordonnées de la découpe sont celles de cette grille.
- Après chaque découpe, regarder `pulse-motion personnages planche marche --dessin <nom> --vues 0,45,180 --dossier .`. Une articulation mal placée se voit tout de suite : le membre tourne autour du mauvais point.
- Refaire la découpe ne touche qu'à la vue découpée : les autres vues dessinées et les bouches ajoutées sont gardées. Les couleurs gardent leur nom.

## Format

```json
{ "nom": "cuisinier", "source": "assets/cuisinier.svg", "vue": "profil",
  "os": {
    "torse": { "formes": ["#veste"], "de": [202, 402], "a": [202, 282] },
    "tete": { "formes": ["#tete"], "centre": [205, 210] },
    "cuisseAvant": { "formes": ["#cuisse-av"], "de": [201, 402], "a": [201, 500] },
    "tibiaAvant": { "formes": ["g2>rect2"], "de": [201, 500], "a": [201, 600] },
    "piedAvant": { "formes": ["#chaussure-av"], "de": [199, 606], "a": [243, 606] },
    "brasAvant": { "formes": ["#bras-av"], "de": [205, 295], "a": [193, 364] },
    "avantBrasAvant": { "formes": ["#avant-bras-av"], "de": [193, 364], "a": [180, 434] },
    "mainAvant": { "formes": ["#main-av"], "de": [180, 434], "a": [177, 453] }
  },
  "visage": { "yeux": [{ "blanc": "#oeil-blanc", "pupille": "#pupille" }], "bouche": "#bouche" },
  "ignorer": ["#ombre"],
  "couleurs": { "#F2C9A0": "peau" } }
```

- **Sélecteurs** : ceux de l'analyse (`#id`, ou `g2>rect2` pour une forme sans id). Un groupe (`#tete`) donne toutes ses formes ; le visage les reprend ensuite.
- **`de` / `a`** : l'articulation de départ, puis le bout de l'os. Torse : `de` = bassin, `a` = cou. Pied : `de` = cheville, `a` = pointe. Main : `de` = poignet, `a` = bout des doigts. Tête et bassin : `centre`.
- **Côtés** : `…Avant` = le membre du côté de la personne qui regarde (de profil, le plus proche). Si les membres `…Arriere` ne sont pas donnés, ceux de devant servent aux deux.
- **`vue`** : `profil` de préférence (personnage tourné vers la droite) ; `face` si l'illustration est de face (elle servira alors aussi de profil, à redessiner plus tard).
- **`visage`** (facultatif) : yeux (blanc et pupille) et bouche en formes séparées → yeux qui regardent et clignent, bouche `neutre` (les autres bouches se dessinent ensuite avec `/pulse-motion:dessiner-personnage`). Sans visage, le visage reste figé dans la tête.
- **`ignorer`** : ce qui ne fait pas partie du personnage (ombre, décor). Une forme rangée nulle part est signalée par `decouper`.
- **`couleurs`** (facultatif) : noms donnés aux couleurs (`#RRGGBB` → nom). Plus simple : `pulse-motion personnages renommer-couleur <nom> c1 tenue --dossier .` après la découpe ; la découpe retient le nom.

## Placer les articulations

- Sur le PNG, au centre de l'articulation dessinée (le rond du genou, le pli du coude), pas au bord de la forme.
- Une jambe tendue : hanche, genou et cheville presque alignés ; les longueurs de la cuisse et du tibia viennent de ces points (le personnage garde ses proportions, à la taille du gabarit standard).
- Le cou (`torse.a`) sous le menton ; le centre de la tête au milieu du visage.

## Refus et remèdes (à expliquer simplement)

| L'analyse refuse | Dans le logiciel de dessin |
|---|---|
| du texte | convertir le texte en formes (« Vectoriser », « Objet en chemin ») |
| une image | la redessiner en formes, ou l'ignorer |
| une copie (`use`) | délier le clone (« Objet > Décomposer ») |
| un filtre, un masque | les retirer ou les appliquer |
| des styles « par entités » (Illustrator) | réexporter avec « Propriétés CSS : éléments de style » |

Un masque d'écrêtage (découpe) n'est pas refusé : la forme est dessinée entière (avertissement).

## Corriger à la souris

`pulse-motion personnages atelier --decoupe <nom> --dossier .` (en arrière-plan) : l'illustration, les formes encadrées de la couleur de leur os, les articulations à glisser, l'aperçu qui marche, « Enregistrer ».
