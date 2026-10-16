---
description: Dessiner un personnage pour la vidéo Pulse Motion du dossier, ou retoucher son dessin, et le montrer qui bouge (« dessine-moi un cuisinier rondouillard avec une toque », « change sa tenue en rouge », « refais-lui la tête », « ajoute-lui des lunettes »). Pour ses poses et ses mouvements, c'est /pulse-motion:animer-personnage ; pour le régler à la souris, /pulse-motion:atelier-personnages.
argument-hint: "[le personnage à dessiner, ou la retouche de son dessin]"
allowed-tools: Bash(pulse-motion *) Bash(node *) Read Glob Grep Write Edit AskUserQuestion
---

# /pulse-motion:dessiner-personnage – Un personnage dessiné, qui bouge

Dessiner (ou retoucher) un personnage en pièces SVG qui s'anime avec les poses et mouvements de Pulse Motion, le vérifier sur les planches, puis le montrer.

## Règles

- Parler simplement, en français, sans jargon : jamais « SVG », « JSON », « fichier », ni de commande montrée. Dire « le dessin de votre personnage », « rangé avec votre vidéo ».
- Le dessin se range dans le dossier d'une vidéo (`personnages/dessins/<nom>.json`). Sans vidéo dans ce dossier (`pulse-motion etat .` sans déroulé) : le dire simplement et proposer `/pulse-motion:creer`, puis s'arrêter.
- Nom du dessin : minuscules, chiffres, tirets, tiré de la demande (`cuisinier`, `docteur-lunettes`).
- Lexique : avant d'expliquer un mot de l'outil, lire `pulse-motion lexique` ; un mot expliqué pour la première fois se note avec `pulse-motion lexique noter "<terme>" "<phrase>" "<comme…>" "/pulse-motion:dessiner-personnage"`.
- La commande échoue avec « node » introuvable (Node.js n'est pas installé) : expliquer qu'il faut installer Node.js en version LTS depuis https://nodejs.org, puis relancer Claude Code, et s'arrêter.

## 1. Préparer

1. Lire `pulse-motion reference dessin-personnages` (repère « os debout », longueurs, visage, style) en entier.
2. `pulse-motion personnages liste --dossier .` : un dessin du même nom existe déjà ? Retouche : partir de `pulse-motion personnages afficher <nom> --type dessin --dossier .`. Nouveau : partir de `pulse-motion personnages afficher touffu --type dessin`.
3. Si la demande est floue sur un point qui change tout le dessin (humain ou animal, silhouette), une seule question avec `AskUserQuestion`, choix proposés et une option « (Recommandé) ». Sinon, décider.

## 2. Dessiner

Écrire `personnages/dessins/<nom>.json` :

- profil complet d'abord (obligatoire), puis `face` (et `dos`, `troisQuarts` si le personnage se tourne) ;
- couleurs en variables (`couleurs`), réutilisées par toutes les pièces (« change sa tenue en rouge » = changer une couleur, sans redessiner) ;
- pièces qui débordent de leur pivot (bouts arrondis) : aucun trou ni pointe aux articulations ;
- **cohérence entre les vues** : chaque vue dessinée a les mêmes éléments (le cou, le haut du torse, les accessoires, la coiffure) aux mêmes proportions ; le cou (ou le haut du torse) recouvre le bas de la tête **dans chaque vue** ; une forme ajoutée dans une vue est ajoutée dans les autres ;
- visage : `oeil`, `sourcil`, au moins la bouche `neutre` et les bouches d'expression (`sourire`, `triste`, `surprise`, `colere`, `rire`), positions par vue.

## 3. Vérifier et corriger (trois tours au plus)

1. `pulse-motion personnages verifier --dossier .` : corriger chaque erreur.
2. Regarder avec `Read` les deux planches :
   - `pulse-motion personnages planche marche --dessin <nom> --vues 0,45,90,-90 --dossier .` (le corps en mouvement) ;
   - `pulse-motion personnages planche --dessin <nom> --visage --dossier .` (expressions et bouches).
3. Chercher, **en comparant les vues entre elles** : tête séparée du corps dans une vue, trou ou pointe à une articulation, pièce à l'envers ou décalée, accessoire qui flotte, visage décentré, bouche illisible, élément présent dans une vue et absent d'une autre. Corriger et recommencer.

## 4. Montrer

Une phrase sur le personnage, puis la planche de la marche (ouverte avec `--ouvrir` si la personne veut la voir), et ce qu'on peut faire ensuite : le faire bouger (`/pulse-motion:animer-personnage`), le régler soi-même (`/pulse-motion:atelier-personnages`), changer une couleur.
