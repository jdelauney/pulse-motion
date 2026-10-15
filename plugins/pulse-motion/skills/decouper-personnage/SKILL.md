---
description: Animer l'illustration d'un personnage fournie par la personne (fichier SVG d'Illustrator, Inkscape, Figma…) en la découpant sur le squelette de Pulse Motion (« voici notre mascotte en SVG, fais-la marcher », « découpe ce dessin pour l'animer », « j'ai un personnage dans assets, anime-le »). Pour un personnage à inventer, c'est /pulse-motion:dessiner-personnage ; pour corriger la découpe à la souris, /pulse-motion:atelier-personnages.
argument-hint: "[le fichier SVG du personnage]"
allowed-tools: Bash(pulse-motion *) Bash(node *) Read Glob Grep Write Edit AskUserQuestion
---

# /pulse-motion:decouper-personnage – Une illustration qui s'anime

Découper l'illustration fournie en pièces posées sur le squelette (une par os), vérifier qu'elle marche, la montrer.

## Règles

- Parler simplement, en français, sans jargon : jamais « SVG », « JSON », « sélecteur », « pivot », ni de commande montrée. Dire « votre illustration », « les articulations », « rangé avec votre vidéo ».
- La découpe se range dans le dossier d'une vidéo. Sans vidéo dans ce dossier : le dire et proposer `/pulse-motion:creer`, puis s'arrêter.
- Un seul personnage par illustration, de profil de préférence (sinon de face) ; les autres éléments du fichier (décor, ombre au sol) vont dans « ignorer ».
- Lexique : avant d'expliquer un mot de l'outil, lire `pulse-motion lexique` ; un mot expliqué pour la première fois se note avec `pulse-motion lexique noter "<terme>" "<phrase>" "<comme…>" "/pulse-motion:decouper-personnage"`.
- La commande échoue avec « node » introuvable (Node.js n'est pas installé) : expliquer qu'il faut installer Node.js en version LTS depuis https://nodejs.org, puis relancer Claude Code, et s'arrêter.

## 1. Regarder l'illustration

1. Lire `pulse-motion reference decoupe-personnages` en entier.
2. Copier le fichier dans `assets/` de la vidéo s'il n'y est pas (nom en minuscules et tirets).
3. `pulse-motion personnages analyser assets/<fichier>.svg --dossier .` : lire le JSON (formes numérotées, calques, boîtes, couleurs) et regarder le PNG annoté avec `Read` (numéros, grille de coordonnées).
4. Des refus (texte, image, filtre, masque, styles par entités) : expliquer simplement quoi changer dans le logiciel de dessin, et s'arrêter tant que ce n'est pas fait (ou proposer d'ignorer la forme si elle est décorative).

## 2. Écrire la découpe

`personnages/decoupes/<nom>.json` : pour chaque os, ses formes et ses articulations lues sur la grille (hanche, genou, cheville, pointe du pied ; épaule, coude, poignet, bout des doigts ; bassin et cou pour le torse ; centre de la tête). Visage vivant si les yeux et la bouche sont des formes à part. « ignorer » pour le reste. Une forme ne va que dans un os ; un groupe peut être donné entier.

## 3. Découper, vérifier, corriger (trois tours au plus)

1. `pulse-motion personnages decouper <nom> --dossier .` : lire les formes « laissées de côté » et les ranger (ou les ignorer).
2. Nommer les couleurs principales : `pulse-motion personnages renommer-couleur <nom> c1 <peau|tenue|…> --dossier .` (pour que « change sa tenue en rouge » marche ensuite).
3. Regarder avec `Read` : `pulse-motion personnages planche marche --dessin <nom> --vues 0,45,180 --dossier .` (et `--visage` si le visage est vivant). Chercher : membre qui se détache ou tourne autour du mauvais point (articulation mal placée), forme dans le mauvais membre, tête décalée. Corriger la découpe et recommencer.

## 4. Montrer

La planche de la marche, une phrase, et la suite possible : le corriger à la souris (`/pulse-motion:atelier-personnages`, découpe), le faire bouger (`/pulse-motion:animer-personnage`), dessiner sa vue de face (`/pulse-motion:dessiner-personnage`) si l'illustration n'est que de profil.
