---
description: Ouvrir l'atelier (l'éditeur) des effets de particules Pulse Motion pour régler un effet en le regardant (« ouvre l'éditeur de particules », « ouvre l'atelier des effets », « laisse-moi régler les étincelles », « je veux voir ce que donne la neige »). Pour l'éditeur des personnages, c'est /pulse-motion:atelier-personnages.
argument-hint: "[l'effet à régler]"
allowed-tools: Bash(pulse-motion *) Bash(node *) Read Glob Grep AskUserQuestion
---

# /pulse-motion:atelier-particules – Régler un effet à l'œil

Ouvrir l'atelier des effets de particules sur l'effet demandé, puis relire le réglage retenu.

## Règles

- Parler simplement, en français, sans jargon ni commande montrée.
- « L'éditeur » sans autre précision, alors que la vidéo a aussi des personnages : une question avec `AskUserQuestion` (« Les effets de particules » · « Les personnages ») ; personnages : `/pulse-motion:atelier-personnages`.
- Lexique : avant d'expliquer un mot de l'outil, lire `pulse-motion lexique` ; un mot expliqué pour la première fois se note avec `pulse-motion lexique noter "<terme>" "<phrase>" "<comme…>" "/pulse-motion:atelier-particules"`.
- La commande échoue avec « node » introuvable (Node.js n'est pas installé) : expliquer qu'il faut installer Node.js en version LTS depuis https://nodejs.org, puis relancer Claude Code, et s'arrêter.

## 1. Ouvrir

- Un effet déjà posé dans une scène : proposer le bouton « Effets » de l'aperçu (curseurs en direct sur la scène, « Enregistrer ») ; ouvrir l'aperçu avec `pulse-motion apercu . --ouvrir` en arrière-plan.
- Un effet à travailler seul (« laisse-moi régler les étincelles ») : `pulse-motion atelier <effet>` en arrière-plan (effets connus : `pulse-motion reference particules`), attendre sa ligne « Atelier ». Hors du dossier d'une vidéo, l'atelier règle mais n'enregistre pas : le dire.
- Ses enregistrements passent par l'historique (« annule » les défait).

## 2. Après

Quand la personne dit avoir fini : lire la scène ou `effets/<nom>.json` pour connaître le réglage retenu, et le dire en une phrase.
