---
description: Créer ou modifier une pose ou un mouvement de personnage Pulse Motion, et le montrer sous plusieurs angles (« fais une pose où il se gratte la tête », « il marche trop vite », « fais-le sauter plus haut », « montre-moi la course de face et de profil », « fais-lui une tête surprise quand il salue », « quels mouvements existent ? »). Pour dessiner le personnage, c'est /pulse-motion:dessiner-personnage ; pour régler à la souris, /pulse-motion:atelier-personnages.
argument-hint: "[la pose ou le mouvement voulu]"
allowed-tools: Bash(pulse-motion *) Bash(node *) Read Glob Grep Write Edit AskUserQuestion
---

# /pulse-motion:animer-personnage – Poses et mouvements

Créer ou modifier une pose ou un mouvement (marche, course, saut, geste, expression), le vérifier sur la planche, le montrer.

## Règles

- Parler simplement, en français, sans jargon : jamais « JSON », « clip », « clé », ni de commande montrée. Dire « le mouvement », « la pose », « à tel moment ».
- Lire `pulse-motion reference personnages` avant d'écrire (angles, poses, mouvements, expressions).
- Les poses et mouvements nouveaux ou modifiés se rangent dans le dossier de la vidéo (`personnages/poses/<nom>.json`, `personnages/clips/<nom>.json`) ; un mouvement de la bibliothèque n'est jamais modifié : on en fait une copie du même nom dans la vidéo, qui le remplace pour elle. Sans vidéo dans ce dossier : seulement montrer (planche), et dire que pour créer il faut le dossier d'une vidéo (`/pulse-motion:creer`).
- Lexique : avant d'expliquer un mot de l'outil, lire `pulse-motion lexique` ; un mot expliqué pour la première fois se note avec `pulse-motion lexique noter "<terme>" "<phrase>" "<comme…>" "/pulse-motion:animer-personnage"`.
- La commande échoue avec « node » introuvable (Node.js n'est pas installé) : expliquer qu'il faut installer Node.js en version LTS depuis https://nodejs.org, puis relancer Claude Code, et s'arrêter.

## Selon la demande

| La personne dit | Ce qu'on fait |
|---|---|
| « quels mouvements existent ? » | `pulse-motion personnages liste --dossier .` ; dire en mots simples poses, mouvements, expressions, personnages dessinés |
| « montre-moi la course de face » | `pulse-motion personnages planche course --vues 0,90 --dossier .` (ajouter `--dessin <nom>` pour un personnage dessiné), regarder avec `Read`, montrer (`--ouvrir`) |
| « fais une pose où il… » | écrire `personnages/poses/<nom>.json` (partir d'une pose proche : `pulse-motion personnages afficher <pose>`) |
| « il marche trop vite », « saute plus haut » | copie du mouvement dans la vidéo (`pulse-motion personnages afficher <mouvement>`), puis la modification (`duree`, angles d'une clé) |
| « fais-lui une tête surprise quand il salue » | copie du mouvement, `"expression": "surprise"` (ou `"bouche"`) sur la clé du moment voulu |
| « mets le cuisinier dans la scène 3, qu'il montre le chiffre », « fais-le entrer puis repartir » | lire la section « Personnages » de `pulse-motion reference moteur` ; ajouter dans le fichier de la scène le conteneur `data-personnage` et ses actions (ou confier la scène à l'agent `animateur` avec cette consigne) ; puis `pulse-motion assembler .`, `pulse-motion controler .` et `pulse-motion planche . <id>` (regarder avec `Read`) |
| « fais-le parler », « qu'il dise le texte de la scène » | dans le conteneur du personnage : `<i data-action="parler"></i>` (la scène doit avoir une voix ; fenêtre avec `data-start="mot:…"` et `data-dur` si deux personnages se partagent la voix) ; assembler, puis `pulse-motion planche . <id>` pendant la voix |
| « un nouveau geste » | nouveau mouvement : clés à partir de `"pose": "debout"`, pieds `au-sol` s'il reste debout |

## Vérifier et montrer

1. `pulse-motion personnages verifier --dossier .` : corriger chaque erreur.
2. `pulse-motion personnages planche <nom> --vues 0,45,90 --dossier .` (avec `--dessin <nom>` si la vidéo a un personnage dessiné), regarder avec `Read` : membres qui ne plient pas à l'envers, pieds sur la ligne, mouvement lisible, ressemblant à la demande. Corriger (trois tours au plus).
3. Montrer la planche, une phrase sur ce qui a changé, et proposer de régler soi-même avec `/pulse-motion:atelier-personnages`.
