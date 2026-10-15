---
description: Ouvrir l'atelier (l'éditeur) des personnages Pulse Motion pour poser et animer un personnage à la souris (« ouvre l'éditeur de personnage », « ouvre l'atelier des personnages », « je veux régler son salut moi-même », « laisse-moi placer ses bras », « je veux voir le cuisinier sous tous les angles »). Pour l'éditeur des effets de particules, c'est /pulse-motion:atelier-particules.
argument-hint: "[le mouvement ou la pose à ouvrir, et le personnage]"
allowed-tools: Bash(pulse-motion *) Bash(node *) Read Glob Grep AskUserQuestion
---

# /pulse-motion:atelier-personnages – Poser et animer à la souris

Ouvrir l'atelier des personnages dans le navigateur, sur le mouvement ou la pose demandés, avec le personnage voulu ; puis relire ce que la personne a enregistré.

## Règles

- Parler simplement, en français, sans jargon ni commande montrée.
- « L'éditeur » sans autre précision, alors que la vidéo a aussi des effets de particules : une question avec `AskUserQuestion` (« Les personnages (Recommandé) » · « Les effets de particules ») ; particules : `/pulse-motion:atelier-particules`.
- Lexique : avant d'expliquer un mot de l'outil (atelier, image-clé, frise…), lire `pulse-motion lexique` ; un mot expliqué pour la première fois se note avec `pulse-motion lexique noter "<terme>" "<phrase>" "<comme…>" "/pulse-motion:atelier-personnages"`.
- La commande échoue avec « node » introuvable (Node.js n'est pas installé) : expliquer qu'il faut installer Node.js en version LTS depuis https://nodejs.org, puis relancer Claude Code, et s'arrêter.

## 1. Ouvrir

1. `pulse-motion personnages liste --dossier .` : retrouver le mouvement ou la pose (« son salut » → `coucou`, ou la copie de la vidéo s'il y en a une) et le personnage dessiné de la vidéo (s'il y en a un seul, le prendre ; plusieurs : demander lequel).
2. `pulse-motion personnages atelier <nom> --dessin <dessin> --dossier .` en arrière-plan (sans `--dessin` pour les bâtonnets), et attendre sa ligne « Atelier des personnages ». Sans vidéo dans ce dossier, l'atelier s'ouvre quand même mais n'enregistre pas : le dire.
3. Expliquer en trois phrases : glisser une articulation tourne le membre ; Maj + glisser une main ou un pied l'amène sous la souris ; la frise du bas porte les moments du mouvement, « Enregistrer » range le résultat avec la vidéo (et « annule » le défait).

## 2. Après

Quand la personne dit avoir fini : `pulse-motion personnages liste --dossier .`, lire le fichier enregistré, puis `pulse-motion personnages planche <nom> --dessin <dessin> --dossier .` et le montrer en une phrase. Si elle a enregistré sous un nouveau nom, le dire.
