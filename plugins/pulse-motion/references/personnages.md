# Personnages

## L'essentiel

- Un personnage a un squelette commun (bassin, colonne, tête, deux bras, deux jambes, et parfois des os en plus comme une queue) ; ses **poses** et ses **mouvements** (clips) sont des fichiers `personnages/poses/<nom>.json` et `personnages/clips/<nom>.json` dans le dossier de la vidéo. À nom égal, ils remplacent ceux de la bibliothèque du plugin.
- Avant d'écrire : `pulse-motion personnages liste --dossier .` (ce qui existe) et `pulse-motion personnages afficher <nom>` (un exemple proche à adapter).
- Après avoir écrit : `pulse-motion personnages verifier --dossier .`, puis `pulse-motion personnages planche <nom> --dossier .` et regarder le PNG avec `Read` (vignettes sous plusieurs angles). Corriger tant que le mouvement ne ressemble pas à la demande.
- Pour régler à l'œil, ou si la personne veut le faire elle-même : `pulse-motion personnages atelier <nom>` en arrière-plan (page de l'aperçu, « Enregistrer » écrit dans la vidéo ; « annule » défait).
- Côtés **Avant** et **Arrière** (côté tourné vers la caméra de profil, et l'autre), jamais gauche / droite.
- Mettre un personnage dans une scène (entrer, montrer, saluer, repartir, calé sur les autres éléments ou la voix) : `pulse-motion reference moteur/personnages`.
- Pour un personnage dessiné (pièces SVG, visage complet) : `pulse-motion reference dessin-personnages`.

## Angles (degrés)

| Clé | Sens |
|---|---|
| `cuisseAvant`, `cuisseArriere`, `brasAvant`, `brasArriere` | négatif = membre porté vers l'avant (bras levé devant : -90 ; au-dessus de la tête : -168) |
| `tibiaAvant`, `tibiaArriere` | genou : 0 = tendu, positif = plié (0 à 150) |
| `avantBrasAvant`, `avantBrasArriere` | coude : 0 = tendu, négatif = plié (-150 à 0) |
| `piedAvant`, `piedArriere` | absolu : 0 = à plat |
| `ecartBras…`, `ecartJambe…` | écarté sur le côté, positif = vers l'extérieur |
| `torsionBras…`, `torsionJambe…` | oriente la charnière : `torsionBras… 90` = le coude plie sur le côté (coucou, mains sur les hanches) |
| `torse`, `torseRot`, `torseIncl` | flexion (positif = penché en avant), rotation des épaules, inclinaison sur le côté |
| `tete`, `teteTourne`, `tetePenche` | hochement, tourner (positif = vers la caméra de profil), pencher |
| `bassinY`, `bassinRot` | hauteur du bassin (négatif = plus haut), bascule |
| `yeuxY`, `tailleYeux`, `paupieres`, `regardX`, `regardY`, `taillePupilles` | expression (paupières : 1 = ouvertes, 0,1 = fermées) |
| `sourcilsY`, `sourcilsAngle` | sourcils : levés ; angle positif = colère, négatif = tristesse |
| `touffeRot`, `touffeEtire`, `touffeEventail`, `touffeOnde` | la touffe de cheveux |

Les angles sont bornés (genou, coude, épaule…) : une valeur trop forte est ramenée à la limite.

## Pose

```json
{ "nom": "gratte-tete", "description": "se gratte la tête, perplexe",
  "angles": { "brasAvant": -150, "avantBrasAvant": -120, "ecartBrasAvant": 20, "tetePenche": 10, "regardY": -3 } }
```

Une pose ne donne que ce qui change ; le reste est la pose de repos. Pas de `x`, `y`, `vue` : la place se décide dans la scène.

## Clip (mouvement)

```json
{ "nom": "salut", "description": "lève le bras et salue", "boucle": false, "pieds": "au-sol",
  "cles": [ { "t": 0, "pose": "debout" },
            { "t": 0.4, "angles": { "brasAvant": -160, "avantBrasAvant": -20 }, "courbe": "back-out" },
            { "t": 1.2, "pose": "debout" } ] }
```

- `boucle: true` (cycle : marche, course) : `t` est une **phase** de 0 à 1 et `duree` la durée d'un cycle en secondes ; `boucle: false` (geste) : `t` en secondes.
- Chaque angle a sa propre piste : une clé qui ne donne que des angles ne fixe que ceux-là, ils s'interpolent entre les clés qui les donnent. Une clé qui **cite une pose** remet tous les angles animés à cette pose (`"pose": "debout"` ramène au repos).
- `courbe` (de cette clé à la suivante) : `sine-inout` par défaut, `linear`, `cubic-out`, `back-out` (dépasse puis revient), `bounce-out`.
- `pieds: "au-sol"` : le bassin descend tout seul pour que le pied le plus bas touche le sol ; `bassinY` devient alors un décalage (rebond).
- `miroir: 0.5` (cycles) : n'écrire que les membres Avant ; les membres Arrière suivent avec une demi-phase de décalage.
- `additif: true` : les valeurs sont des différences, à ajouter à un autre mouvement (respiration, clignement, repos vivant).
- `lissage: "continu"` : les poses s'enchaînent sans que le mouvement s'arrête à chaque clé (défaut `"par-cle"` : il ralentit et repart à chaque clé). Une clé qui porte une `courbe` garde la sienne (accent voulu, `back-out`). Pour « il est raide », « il fait robot ».
- `contacts: [0.936]` (gestes) : instants où les pieds retouchent le sol ; le personnage s'y écrase un peu (8 %) en gardant son volume.
- `foulee` : distance parcourue par cycle (marche 248, course 330), pour la marche sans glissement des scènes.

## Bibliothèque

Poses : `debout`, `montrer`, `bras-leves`, `mains-hanches`, `assis`, `penche`. Mouvements : `repos`, `marche`, `course`, `saut`, `accroupi`, `se-relever`, `coucou`, `peur`, `respiration` (additif), `repos-vivant` (additif : petits mouvements déphasés d'une pose tenue, ajoutés par le moteur), `clignement` (additif : la forme d'un clignement, 110 ms pour fermer, 40 de maintien, 190 pour rouvrir ; le moteur choisit les instants). `coucou`, `repos`, `respiration` et `repos-vivant` sont en `lissage: "continu"`. Gabarits : `standard`, `avec-queue`.

Expressions : `neutre`, `joie`, `tristesse`, `peur`, `colere`, `surprise` (`"expression": "joie"` dans une pose ou une clé ; `"bouche": "O"` choisit une bouche). Rythme du clignement d'une expression : `"clignement": { "intervalle": [4, 5.5], "lenteur": 1.4 }` (secondes entre deux clignements, de 1,5 à 8 ; lenteur de 0,7 à 2) ; sans lui, toutes les 3 à 4 s.

Gabarit : `"vie": { "retard": 0.1, "force": 0.45 }` (avant-bras et tête arrivent `retard` s après leur parent, de 0,06 à 0,15 ; `force` de 0,3 à 0,6). Dessins : `touffu`, `ecoliere`, `soignant`, `grand-mere` (manière « traits »), `technicien`, `cuisiniere`, `guide` (« pièces pleines »). Le style `mode-d-emploi` règle sa vie à `mains` (corps immobile, bras qui travaillent) et rend ses personnages image par image (12 i/s).

## Retouches en une phrase

| La personne dit | Ce qu'on fait |
|---|---|
| « fais une pose où il se gratte la tête » | `personnages/poses/gratte-tete.json`, vérifier, planche |
| « il marche trop vite » | copie de `marche` dans la vidéo, `duree` plus grande (ex. 1,3) |
| « il monte sur la colline », « il saute sur la corniche », « les touffes surgissent du bas » | dans la scène : `marcher` avec `data-sol="#colline"` (tracé du décor), `bondir` avec `data-sol` et `data-hauteur`, `glisser` depuis un sol sous l'image (`pulse-motion reference moteur/personnages`) |
| « une file de 6 Touffus qui sortent un par un », « la troupe traverse le pont » | un groupe : `data-groupe`, `data-ecart`, `data-decalage`, `data-depart="commun"`, actions communes et `data-membre` (`pulse-motion reference moteur/personnages`) |
| « il attrape le bras de son voisin », « ils se tapent dans la main », « il regarde la pancarte », « il nous regarde » | dans la scène : actions `atteindre` (cible : élément, point, personnage ; rencontre si les deux s'atteignent) et `regarder` (cible, ou `camera`) (`pulse-motion reference moteur/personnages`) |
| « il tient une pancarte », « il boit son café », « il lance la pelote » | dans la scène : l'objet (élément de la scène, même conteneur) avec `data-tenu-par="#id"`, `data-main`, `data-orientation`, `data-lacher` (`pulse-motion reference moteur/personnages`) |
| « une démarche fière pour lui seul » | nouveau cycle `personnages/clips/marche-fiere.json` (copie de `marche`, `boucle: true`, sa `foulee`), puis `data-clip="marche-fiere"` sur son action `marcher` |
| « il saute plus haut » | copie de `saut`, `bassinY` de l'envol plus négatif (ex. -150 → -200) |
| « montre-moi la course de face et de profil » | `pulse-motion personnages planche course --vues 0,90 --dossier .` puis `Read` |
| « il est raide », « il fait robot » | copie du mouvement dans la vidéo avec `"lissage": "continu"` |
| « il lance la balle à son ami » | l'objet tenu en `data-lacher="lance"`, `data-cible="#ami"` (même conteneur) ; l'ami `regarder` la balle |
| « il flotte » | action `flotter` (`data-hauteur`, `data-dur`) |
| « il ne bouge pas quand il attend » | `data-vie="pleine"` sur le conteneur (ou retirer `data-vie="sobre"`, `data-calme="non"`) |
| « il cligne trop » | copie de l'expression dans la vidéo, `clignement.intervalle` plus grand (ex. [5, 7]) |
| « enlève son ombre » | `data-ombre="non"` sur le conteneur |
| « qu'il bouge moins » ; « qu'il reste immobile » | `data-vie="sobre"` (clignement et respiration seulement) ; `data-vie="aucune"` |
| « il regarde passer la balle » | `regarder` avec `data-cible` sur l'objet |
| « je veux régler moi-même » | `pulse-motion personnages atelier <nom>` en arrière-plan |
